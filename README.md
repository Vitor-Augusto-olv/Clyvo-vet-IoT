# 🐾 PetSense — Monitor IoT de Saúde do Pet
### CLYVO VET | Challenge FIAP 2026 | Disruptive Architectures: IoT

---

## 📌 Descrição do Projeto

O **PetSense** é um sistema de monitoramento IoT contínuo da saúde animal 
através de uma **roupa inteligente para pets**, desenvolvido como parte do 
**Challenge FIAP 2026** em parceria com a **CLYVO VET**.

A roupa é equipada com sensores embutidos que monitoram sinais vitais do 
animal em tempo real — temperatura corporal e frequência cardíaca — enviando 
os dados para o responsável e para a clínica parceira via dashboard web.

---

## 🎯 Problema que Resolve

A jornada do pet hoje é **fragmentada e episódica**:
- O tutor só vai à clínica em emergências ou vacinação
- Não há monitoramento entre as consultas
- Sinais de agravamento são percebidos tarde demais
- Clínicas perdem recorrência e LTV do cliente

O **PetSense** preenche esse gap com monitoramento IoT de sinais vitais.

---

## 🔧 Tecnologias Utilizadas

| Componente | Tecnologia | Equivalente Real |
|---|---|---|
| Microcontrolador | ESP32 (simulado no Wokwi) | ESP32 embutido na roupa |
| Sensor de temperatura | DHT22 | Sensor infravermelho corporal |
| Sensor de frequência cardíaca | Potenciômetro (simulação) | Sensor de oximetria (PPG) |
| Display | LCD 16x2 I2C | App mobile / dashboard web |
| Indicadores | LEDs verde/vermelho | Notificação push no celular |
| Protocolo de envio | HTTP (POST JSON) | HTTP/MQTT via WiFi ou BLE |
| Simulação | Wokwi |

---

## ⚙️ Como Executar

### Simulação no Wokwi

1. Acesse [wokwi.com](https://wokwi.com) e crie um novo projeto ESP32
2. Substitua o código padrão pelo arquivo `petsense_wokwi.ino`
3. Copie o conteúdo de `diagram.json` para a aba de diagrama
4. Clique em **▶ Play** para iniciar a simulação
5. Ajuste o potenciômetro para variar o BPM e observe os alertas

### Dashboard

1. Abra o arquivo `dashboard.html` diretamente no navegador
2. Os dados serão simulados automaticamente a cada 2 segundos
3. Em produção: conecte ao endpoint `/data` do servidor Flask/Node

### Dependências Arduino (Wokwi)

As bibliotecas abaixo são configuradas automaticamente no `libraries.txt` do Wokwi:
```
DHT sensor library
LiquidCrystal I2C
ArduinoJson
```

---

## 📐 Arquitetura da Solução

```
[Pet com Sensor]
      │
   [ESP32]
  DHT22 + POT
      │
   HTTP POST
      │
  [Servidor]        ←── Clínica Parceira (CLYVO VET)
  /data endpoint
      │
  [Dashboard Web]   ←── Tutor (via browser/app)
  Gráficos + Alertas
```

---

## 📊 Métricas Monitoradas

| Sinal Vital | Faixa Normal (Cão) | Ação ao Alertar |
|---|---|---|
| Temperatura corporal | 37,5°C – 39,5°C | LED vermelho + alerta no dashboard |
| Frequência cardíaca | 60 – 140 bpm | LED vermelho + notificação |

---

## 🏆 Critérios de Avaliação Atendidos

- ✅ Protótipo funcional simulado no Wokwi
- ✅ Dashboard com informações coletadas
- ✅ Justificativa técnica de IoT aplicado ao pet
- ✅ Demonstração de viabilidade técnica (prova de conceito)
- ✅ Código documentado e repositório organizado

---

## 👥 Equipe

> Challenge FIAP 2026 — 2º Ano ADS — Turmas de Fevereiro

---

## 📎 Links

- 🎥 Vídeo de demonstração: [YouTube - não listado](#)
- 🔗 Simulação Wokwi: [https://wokwi.com/projects/464820469692047361](#)
- 🏥 Empresa parceira: [CLYVO VET](https://clyvo.com.br)
