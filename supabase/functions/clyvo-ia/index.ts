// supabase/functions/clyvo-ia/index.ts
// IA do Clyvo Vet: motor de regras (determinístico) + LLM (Gemini) para gerar a mensagem
// em linguagem natural. Dois modos:
//   { modo: 'alerta', pet_id, forcar? }  -> avalia o pet e, se houver achado relevante, gera mensagem proativa
//   { modo: 'chat',   pet_id, mensagem } -> responde dúvida do tutor com o contexto do pet
// Chamada com o JWT do usuário logado, então a Row Level Security do banco continua valendo.

// ------------------------------------------------------------------
// Motor de regras (funções puras - testadas em tests/regras.test.mjs)
// ------------------------------------------------------------------

export type Gravidade = 'info' | 'atencao' | 'urgente';
export interface Achado {
  codigo: string;
  gravidade: Gravidade;
  titulo: string;
  detalhe: string;
}

export interface Pet { id: string; nome: string; especie?: string | null; raca?: string | null; idade?: number | null }
export interface Vacina { nome: string; data_aplicacao: string; proximo_reforco: string }
export interface Medicamento { nome: string; dosagem: string; proxima_aplicacao: string }
export interface Agendamento { tipo: string; data_consulta: string; horario: string; status: string }
export interface Leitura { temperatura: number; bpm: number; alerta: boolean; created_at: string }

const ORDEM: Record<Gravidade, number> = { info: 0, atencao: 1, urgente: 2 };

export function limitesPorEspecie(especie?: string | null) {
  const e = (especie ?? '').toLowerCase();
  if (e.includes('gat')) return { tempMin: 38.0, tempMax: 39.5, bpmMin: 120, bpmMax: 220, tipo: 'gato' };
  return { tempMin: 37.5, tempMax: 39.5, bpmMin: 60, bpmMax: 140, tipo: 'cão' };
}

function diasEntre(deISO: string, ateISO: string): number {
  const [a1, m1, d1] = deISO.split('-').map(Number);
  const [a2, m2, d2] = ateISO.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}

export function avaliarRegras(
  pet: Pet,
  vacinas: Vacina[],
  medicamentos: Medicamento[],
  agendamentos: Agendamento[],
  leituras: Leitura[], // da mais recente para a mais antiga
  hojeISO: string
): Achado[] {
  const achados: Achado[] = [];
  const lim = limitesPorEspecie(pet.especie);

  // ---- Sinais vitais (IoT) ----
  if (leituras.length > 0) {
    const ultima = leituras[0];
    const t = ultima.temperatura;
    const b = ultima.bpm;

    if (t > lim.tempMax) {
      achados.push({
        codigo: 'temp_alta',
        gravidade: t >= lim.tempMax + 1 ? 'urgente' : 'atencao',
        titulo: 'Temperatura acima do normal',
        detalhe: `${t.toFixed(1)} °C (normal para ${lim.tipo}: ${lim.tempMin} a ${lim.tempMax} °C).`,
      });
    } else if (t < lim.tempMin) {
      achados.push({
        codigo: 'temp_baixa',
        gravidade: t <= lim.tempMin - 1.5 ? 'urgente' : 'atencao',
        titulo: 'Temperatura abaixo do normal',
        detalhe: `${t.toFixed(1)} °C (normal para ${lim.tipo}: ${lim.tempMin} a ${lim.tempMax} °C).`,
      });
    }

    if (b > lim.bpmMax) {
      achados.push({
        codigo: 'bpm_alto',
        gravidade: b >= lim.bpmMax + 30 ? 'urgente' : 'atencao',
        titulo: 'Frequência cardíaca elevada',
        detalhe: `${b} bpm (normal para ${lim.tipo}: ${lim.bpmMin} a ${lim.bpmMax} bpm).`,
      });
    } else if (b < lim.bpmMin) {
      achados.push({
        codigo: 'bpm_baixo',
        gravidade: b <= lim.bpmMin - 15 ? 'urgente' : 'atencao',
        titulo: 'Frequência cardíaca baixa',
        detalhe: `${b} bpm (normal para ${lim.tipo}: ${lim.bpmMin} a ${lim.bpmMax} bpm).`,
      });
    }

    // Persistência: 3 ou mais alertas entre as últimas 5 leituras escalam a gravidade
    const recentes = leituras.slice(0, 5);
    const emAlerta = recentes.filter((l) => l.alerta).length;
    if (recentes.length >= 3 && emAlerta >= 3) {
      for (const a of achados) {
        if (a.codigo.startsWith('temp_') || a.codigo.startsWith('bpm_')) a.gravidade = 'urgente';
      }
      achados.push({
        codigo: 'alerta_persistente',
        gravidade: 'urgente',
        titulo: 'Alterações persistentes',
        detalhe: `${emAlerta} das últimas ${recentes.length} leituras estavam fora do normal.`,
      });
    }
  }

  // ---- Vacinas ----
  for (const v of vacinas) {
    const dias = diasEntre(hojeISO, v.proximo_reforco);
    if (dias < 0) {
      achados.push({ codigo: 'vacina_vencida', gravidade: 'atencao', titulo: `Vacina ${v.nome} vencida`,
        detalhe: `O reforço estava previsto para ${v.proximo_reforco} (${-dias} dia(s) de atraso).` });
    } else if (dias <= 7) {
      achados.push({ codigo: 'vacina_proxima', gravidade: 'atencao', titulo: `Vacina ${v.nome} vence em breve`,
        detalhe: `Reforço em ${dias} dia(s), em ${v.proximo_reforco}.` });
    } else if (dias <= 30) {
      achados.push({ codigo: 'vacina_30d', gravidade: 'info', titulo: `Vacina ${v.nome} nos próximos 30 dias`,
        detalhe: `Reforço em ${dias} dia(s), em ${v.proximo_reforco}.` });
    }
  }

  // ---- Medicamentos ----
  for (const m of medicamentos) {
    const dias = diasEntre(hojeISO, m.proxima_aplicacao);
    if (dias < 0) {
      achados.push({ codigo: 'med_atrasado', gravidade: 'atencao', titulo: `Medicamento ${m.nome} atrasado`,
        detalhe: `A aplicação (${m.dosagem}) estava prevista para ${m.proxima_aplicacao}.` });
    } else if (dias <= 1) {
      achados.push({ codigo: 'med_proximo', gravidade: 'info', titulo: `Medicamento ${m.nome} em breve`,
        detalhe: `Próxima aplicação (${m.dosagem}) em ${m.proxima_aplicacao}.` });
    }
  }

  // ---- Check-up de rotina ----
  const futuras = agendamentos.filter((a) => a.status === 'agendado' && a.data_consulta >= hojeISO);
  if (futuras.length === 0 && (pet.idade ?? 0) >= 8) {
    achados.push({ codigo: 'checkup_idoso', gravidade: 'info', titulo: 'Check-up de rotina',
      detalhe: `${pet.nome} tem ${pet.idade} anos e não tem consulta agendada. Pets idosos pedem acompanhamento regular.` });
  }

  return achados.sort((a, b) => ORDEM[b.gravidade] - ORDEM[a.gravidade]);
}

export function maiorGravidade(achados: Achado[]): Gravidade | null {
  if (achados.length === 0) return null;
  return achados.reduce((m, a) => (ORDEM[a.gravidade] > ORDEM[m] ? a.gravidade : m), 'info' as Gravidade);
}

// Mensagem de segurança, usada se o LLM estiver indisponível (a IA nunca deixa o tutor sem aviso)
export function mensagemSemLLM(pet: Pet, achados: Achado[]): string {
  const relevantes = achados.filter((a) => a.gravidade !== 'info');
  const lista = (relevantes.length ? relevantes : achados).slice(0, 3).map((a) => `• ${a.titulo}: ${a.detalhe}`).join('\n');
  const urgente = achados.some((a) => a.gravidade === 'urgente');
  return `Olá! Temos um aviso sobre ${pet.nome}:\n${lista}\n\n` +
    (urgente
      ? 'Recomendamos procurar a clínica Clyvo Vet o quanto antes.'
      : 'Vale agendar uma consulta pelo app para acompanhar de perto.');
}

export const SYSTEM_PROMPT =
  'Você é a assistente virtual da clínica veterinária Clyvo Vet. Responda em português do Brasil, ' +
  'com tom acolhedor, claro e objetivo, em no máximo 100 palavras. ' +
  'Use SOMENTE os dados fornecidos sobre o pet; não invente fatos. ' +
  'Nunca faça diagnóstico nem indique medicamentos ou doses. ' +
  'Se houver sinal urgente, oriente procurar a clínica imediatamente. ' +
  'Quando fizer sentido, sugira agendar consulta pelo aplicativo. ' +
  'Se a pergunta fugir da saúde do pet ou dos dados fornecidos, diga que vai encaminhar para um atendente ' +
  'humano da clínica e termine a resposta com a marca [HANDOFF].';

export function montarContexto(pet: Pet, achados: Achado[], leituras: Leitura[]): string {
  const ult = leituras[0];
  const vitais = ult
    ? `Última leitura da coleira: ${ult.temperatura.toFixed(1)} °C, ${ult.bpm} bpm.`
    : 'Sem leituras recentes da coleira.';
  const lista = achados.length
    ? achados.map((a) => `- [${a.gravidade}] ${a.titulo}: ${a.detalhe}`).join('\n')
    : '- Nenhum achado relevante.';
  return `Pet: ${pet.nome} (${pet.especie ?? 'espécie não informada'}, raça ${pet.raca ?? 'não informada'}, ` +
    `${pet.idade ?? '?'} anos).\n${vitais}\nAchados do motor de regras:\n${lista}`;
}

export function separarHandoff(texto: string): { texto: string; handoff: boolean } {
  const handoff = texto.includes('[HANDOFF]');
  return { texto: texto.replace('[HANDOFF]', '').trim(), handoff };
}

// ------------------------------------------------------------------
// LLM (Gemini)
// ------------------------------------------------------------------

async function chamarGemini(sistema: string, turnos: { role: 'user' | 'model'; text: string }[]): Promise<string> {
  // deno-lint-ignore no-explicit-any
  const env = (globalThis as any).Deno.env;
  const chave = env.get('GEMINI_API_KEY');
  if (!chave) throw new Error('GEMINI_API_KEY não configurada');
  const modelo = env.get('GEMINI_MODEL') ?? 'gemini-flash-latest';

  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sistema }] },
      contents: turnos.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
      generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
    }),
  });
  if (!resp.ok) throw new Error(`Gemini respondeu ${resp.status}`);
  const dados = await resp.json();
  const texto = (dados?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('').trim();
  if (!texto) throw new Error('Gemini retornou resposta vazia');
  return texto;
}

// ------------------------------------------------------------------
// Handler HTTP (Supabase Edge Function)
// ------------------------------------------------------------------

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

async function tratar(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // deno-lint-ignore no-explicit-any
  const env = (globalThis as any).Deno.env;
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const supabase = createClient(env.get('SUPABASE_URL'), env.get('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });

  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return json({ erro: 'Não autenticado' }, 401);

  const corpo = await req.json().catch(() => ({}));
  const { modo, pet_id: petId } = corpo as { modo?: string; pet_id?: string; mensagem?: string; forcar?: boolean };
  if (!petId || (modo !== 'alerta' && modo !== 'chat')) return json({ erro: 'Requisição inválida' }, 400);

  // Dados do pet (a RLS garante que só vêm registros do próprio usuário)
  const { data: pet } = await supabase.from('pets').select('*').eq('id', petId).maybeSingle();
  if (!pet) return json({ erro: 'Pet não encontrado' }, 404);

  const [vac, med, ag, lei] = await Promise.all([
    supabase.from('vacinas').select('nome,data_aplicacao,proximo_reforco').eq('pet_id', petId),
    supabase.from('medicamentos').select('nome,dosagem,proxima_aplicacao').eq('pet_id', petId),
    supabase.from('agendamentos').select('tipo,data_consulta,horario,status').eq('pet_id', petId),
    supabase.from('leituras_iot').select('temperatura,bpm,alerta,created_at').eq('pet_id', petId)
      .order('created_at', { ascending: false }).limit(10),
  ]);

  const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10); // data no fuso de Brasília
  const achados = avaliarRegras(pet, vac.data ?? [], med.data ?? [], ag.data ?? [], lei.data ?? [], hoje);
  const contexto = montarContexto(pet, achados, lei.data ?? []);

  // ---------------- modo alerta (proativo) ----------------
  if (modo === 'alerta') {
    const relevantes = achados.filter((a) => a.gravidade !== 'info');
    if (relevantes.length === 0 && !corpo.forcar) return json({ gerou: false, motivo: 'sem_alertas', achados });

    // Evita spam: no máximo uma mensagem proativa por pet a cada 90 segundos
    if (!corpo.forcar) {
      const limite = new Date(Date.now() - 90000).toISOString();
      const { data: recente } = await supabase.from('mensagens_ia').select('id')
        .eq('pet_id', petId).eq('origem', 'regra').gte('created_at', limite).limit(1);
      if (recente && recente.length > 0) return json({ gerou: false, motivo: 'cooldown', achados });
    }

    let texto: string;
    let fonte: 'gemini' | 'regras' = 'gemini';
    try {
      texto = await chamarGemini(SYSTEM_PROMPT, [{
        role: 'user',
        text: `${contexto}\n\nEscreva uma mensagem proativa para o tutor sobre o que mais importa agora.`,
      }]);
      texto = separarHandoff(texto).texto;
    } catch (_e) {
      texto = mensagemSemLLM(pet, achados);
      fonte = 'regras';
    }

    await supabase.from('mensagens_ia').insert({
      user_id: user.id, pet_id: petId, papel: 'assistant', origem: 'regra', conteudo: texto,
    });
    return json({ gerou: true, mensagem: texto, fonte, achados });
  }

  // ---------------- modo chat ----------------
  const pergunta = String(corpo.mensagem ?? '').trim().slice(0, 500);
  if (!pergunta) return json({ erro: 'Mensagem vazia' }, 400);

  await supabase.from('mensagens_ia').insert({
    user_id: user.id, pet_id: petId, papel: 'user', origem: 'chat', conteudo: pergunta,
  });

  const { data: hist } = await supabase.from('mensagens_ia').select('papel,conteudo')
    .eq('pet_id', petId).order('created_at', { ascending: false }).limit(6);
  const turnos = (hist ?? []).reverse().map((m: { papel: string; conteudo: string }) => ({
    role: (m.papel === 'user' ? 'user' : 'model') as 'user' | 'model',
    text: m.conteudo,
  }));
  if (turnos.length === 0 || turnos[turnos.length - 1].role !== 'user') turnos.push({ role: 'user', text: pergunta });

  let resposta: string;
  let handoff = false;
  let fonte: 'gemini' | 'regras' = 'gemini';
  try {
    const bruto = await chamarGemini(`${SYSTEM_PROMPT}\n\nDados atuais do pet:\n${contexto}`, turnos);
    const sep = separarHandoff(bruto);
    resposta = sep.texto;
    handoff = sep.handoff;
  } catch (_e) {
    resposta = 'No momento não consegui consultar a assistente. Encaminhei sua dúvida para um atendente humano da clínica.';
    handoff = true;
    fonte = 'regras';
  }

  const conteudo = handoff && fonte === 'gemini' ? `${resposta}\n\n(Encaminhado para um atendente humano da clínica.)` : resposta;
  await supabase.from('mensagens_ia').insert({
    user_id: user.id, pet_id: petId, papel: 'assistant', origem: 'chat', conteudo,
  });
  return json({ mensagem: conteudo, handoff, fonte });
}

// deno-lint-ignore no-explicit-any
const DenoRef = (globalThis as any).Deno;
if (DenoRef) {
  DenoRef.serve(async (req: Request) => {
    try {
      return await tratar(req);
    } catch (e) {
      return json({ erro: 'Erro interno', detalhe: String(e) }, 500);
    }
  });
}
