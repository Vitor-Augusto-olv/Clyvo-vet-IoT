# Roteiro do vídeo pitch (≈ 5 minutos) — IoT + IA

Grave a tela com narração. Deixe abertos antes de começar: o **dashboard** logado com o pet selecionado, o **Wokwi** (simulação parada), o **repositório** no GitHub.

| Tempo | Mostrar | Falar |
|---|---|---|
| 0:00–0:30 | Dashboard vazio ou repositório | "Somos a equipe do Clyvo Vet. O tutor só procura a clínica em emergência, e entre as consultas ninguém acompanha o pet. Isso gera atraso em vacinas, sinais ignorados e pouca recorrência para a clínica." |
| 0:30–1:15 | Diagrama do README (arquitetura) | "Nossa solução combina uma coleira IoT, o app e uma IA. A coleira mede temperatura e batimentos e envia ao Supabase. A IA cruza isso com vacinas, medicamentos e consultas e avisa o tutor de forma proativa." |
| 1:15–2:00 | Wokwi rodando + dashboard ao lado | "Aqui o ESP32 simulado envia leituras a cada 5 segundos para o Supabase. Repare que o dashboard atualiza em tempo real, sem recarregar, com gráficos e a faixa normal destacada." |
| 2:00–3:15 | Wokwi: arraste a temperatura do DHT22 para ~40 °C → LED vermelho → dashboard em ALERTA → mensagem proativa no chat | "Vou simular febre no pet. O LED fica vermelho e o dashboard marca alerta. Agora entra a IA: o motor de regras identifica que a temperatura está acima do normal e o Gemini escreve esta mensagem personalizada para o tutor, orientando a procurar a clínica. A decisão é do motor de regras, que é auditável; o LLM só cuida de como dizer." |
| 3:15–4:00 | Chat: pergunte "Quando é o próximo reforço de vacina do Thor?" e depois "Qual o melhor filme de ação?" | "O tutor também pode conversar. Na primeira pergunta a IA usa os dados reais do pet. Na segunda, fora do escopo, ela encaminha para um atendente humano da clínica (handoff), como definimos na Sprint 3." |
| 4:00–4:30 | Terminal com `node --test` (13 testes OK) ou pasta `supabase/functions` | "O motor de regras tem 13 testes automatizados. A chave do Gemini fica como secret no servidor e cada tutor só enxerga os próprios dados, por causa da Row Level Security." |
| 4:30–5:00 | Repositório / README | "Para o tutor: tranquilidade e cuidado contínuo. Para a clínica: mais recorrência e vínculo. O próximo passo é levar os alertas ao app com push e integrar ao WhatsApp. Obrigado." |

Dicas: fale sem pressa; ensaie uma vez; não corte o trecho do alerta (é a prova central); se o Gemini demorar, espere a resposta aparecer.
