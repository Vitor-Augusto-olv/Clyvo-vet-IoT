// Testes do motor de regras da IA. Rode com:  node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  avaliarRegras, maiorGravidade, mensagemSemLLM, separarHandoff, limitesPorEspecie,
} from '../supabase/functions/clyvo-ia/index.ts';

const HOJE = '2026-11-01';
const cao = { id: '1', nome: 'Thor', especie: 'Cachorro', raca: 'Caramelo', idade: 3 };
const leitura = (t, b, alerta = false) => ({ temperatura: t, bpm: b, alerta, created_at: '2026-11-01T12:00:00Z' });

test('Cenário 1: sinais normais e sem pendências não geram achado', () => {
  const a = avaliarRegras(cao, [], [], [], [leitura(38.5, 90)], HOJE);
  assert.equal(a.length, 0);
});

test('Cenário 2: febre leve gera atenção', () => {
  const a = avaliarRegras(cao, [], [], [], [leitura(39.8, 90, true)], HOJE);
  assert.equal(a[0].codigo, 'temp_alta');
  assert.equal(a[0].gravidade, 'atencao');
});

test('Cenário 3: febre alta (>= limite + 1 °C) é urgente', () => {
  const a = avaliarRegras(cao, [], [], [], [leitura(40.6, 90, true)], HOJE);
  assert.equal(a[0].gravidade, 'urgente');
});

test('Cenário 4: BPM muito alto é urgente, BPM um pouco alto é atenção', () => {
  assert.equal(avaliarRegras(cao, [], [], [], [leitura(38.5, 150, true)], HOJE)[0].gravidade, 'atencao');
  assert.equal(avaliarRegras(cao, [], [], [], [leitura(38.5, 175, true)], HOJE)[0].gravidade, 'urgente');
});

test('Cenário 5: 3 alertas entre as 5 últimas leituras escalam para urgente', () => {
  const leituras = [leitura(39.8, 90, true), leitura(39.9, 90, true), leitura(40.0, 90, true), leitura(38.5, 90), leitura(38.5, 90)];
  const a = avaliarRegras(cao, [], [], [], leituras, HOJE);
  assert.ok(a.some((x) => x.codigo === 'alerta_persistente'));
  assert.equal(maiorGravidade(a), 'urgente');
});

test('Cenário 6: vacina vencida e vacina a vencer em 7 dias geram atenção', () => {
  const vacinas = [
    { nome: 'V10', data_aplicacao: '2025-10-01', proximo_reforco: '2026-10-20' },
    { nome: 'Antirrábica', data_aplicacao: '2025-11-08', proximo_reforco: '2026-11-07' },
  ];
  const a = avaliarRegras(cao, vacinas, [], [], [], HOJE);
  assert.ok(a.some((x) => x.codigo === 'vacina_vencida' && x.gravidade === 'atencao'));
  assert.ok(a.some((x) => x.codigo === 'vacina_proxima' && x.gravidade === 'atencao'));
});

test('Cenário 7: vacina daqui a 20 dias é só informativa', () => {
  const a = avaliarRegras(cao, [{ nome: 'Gripe', data_aplicacao: '2025-11-21', proximo_reforco: '2026-11-21' }], [], [], [], HOJE);
  assert.equal(a[0].gravidade, 'info');
});

test('Cenário 8: medicamento atrasado gera atenção', () => {
  const a = avaliarRegras(cao, [], [{ nome: 'Simparic', dosagem: '1 comprimido', proxima_aplicacao: '2026-10-30' }], [], [], HOJE);
  assert.equal(a[0].codigo, 'med_atrasado');
});

test('Cenário 9: pet idoso sem consulta agendada recebe sugestão de check-up', () => {
  const idoso = { ...cao, idade: 10 };
  assert.ok(avaliarRegras(idoso, [], [], [], [], HOJE).some((x) => x.codigo === 'checkup_idoso'));
  const comConsulta = [{ tipo: 'Check-up', data_consulta: '2026-11-10', horario: '08:00', status: 'agendado' }];
  assert.equal(avaliarRegras(idoso, [], [], comConsulta, [], HOJE).length, 0);
});

test('Cenário 10: limites mudam por espécie (gato tem BPM maior que cão)', () => {
  assert.equal(limitesPorEspecie('Gato').bpmMax, 220);
  assert.equal(limitesPorEspecie('Cachorro').bpmMax, 140);
  const gato = { ...cao, especie: 'Gato' };
  assert.equal(avaliarRegras(gato, [], [], [], [leitura(38.5, 180)], HOJE).length, 0);
});

test('Resultado vem ordenado da maior para a menor gravidade', () => {
  const a = avaliarRegras(cao, [{ nome: 'V10', data_aplicacao: '2025-01-01', proximo_reforco: '2026-11-20' }], [], [], [leitura(40.7, 90, true)], HOJE);
  assert.equal(a[0].gravidade, 'urgente');
  assert.equal(a[a.length - 1].gravidade, 'info');
});

test('Fallback sem LLM: mensagem cita o pet e orienta conforme a gravidade', () => {
  const urgente = avaliarRegras(cao, [], [], [], [leitura(40.7, 90, true)], HOJE);
  const msg = mensagemSemLLM(cao, urgente);
  assert.match(msg, /Thor/);
  assert.match(msg, /o quanto antes/);
});

test('Handoff: marca [HANDOFF] é removida e sinalizada', () => {
  const r = separarHandoff('Vou encaminhar para um atendente. [HANDOFF]');
  assert.equal(r.handoff, true);
  assert.equal(r.texto, 'Vou encaminhar para um atendente.');
  assert.equal(separarHandoff('Tudo certo.').handoff, false);
});
