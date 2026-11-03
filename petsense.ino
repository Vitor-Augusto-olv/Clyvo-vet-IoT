/*
 * PetSense - Monitor IoT de Saúde do Pet
 * CLYVO VET | Challenge FIAP 2026 | Sprint 4
 *
 * O ESP32 lê temperatura e BPM e envia para o Supabase (função registrar_leitura).
 * Lá o dado é gravado, recebe o flag de alerta e alimenta o dashboard e a IA em tempo real.
 *
 * Componentes simulados no Wokwi:
 *   - ESP32, DHT22 (temperatura corporal), potenciômetro (BPM), LEDs verde/vermelho, LCD 16x2 I2C
 *
 * Conexões:
 *   DHT22 -> GPIO 4 | POT -> GPIO 34 | LED verde -> GPIO 2 | LED vermelho -> GPIO 15
 *   LCD SDA -> GPIO 21 | LCD SCL -> GPIO 22
 *
 * ATENÇÃO: preencha SUPABASE_URL, SUPABASE_ANON_KEY e DEVICE_TOKEN no Wokwi.
 * Não publique o DEVICE_TOKEN real no GitHub.
 */

#include <DHT.h>
#include <LiquidCrystal_I2C.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>

// ---- Pinos ----
#define DHTPIN 4
#define DHTTYPE DHT22
#define POT_PIN 34
#define LED_GREEN 2
#define LED_RED 15

// ---- WiFi (rede simulada do Wokwi) ----
const char* ssid = "Wokwi-GUEST";
const char* password = "";

// ---- Supabase (preencha) ----
const char* SUPABASE_URL = "https://SEU-PROJETO.supabase.co";
const char* SUPABASE_ANON_KEY = "SUA-CHAVE-PUBLICA-ANON";   // chave pública (anon/publishable)
const char* DEVICE_TOKEN = "TOKEN-DA-COLEIRA";                // retornado por vincular_coleira.sql

// ---- Limites do cão (mesmos do banco e da IA) ----
const float TEMP_MIN = 37.5;
const float TEMP_MAX = 39.5;
const int BPM_MIN = 60;
const int BPM_MAX = 140;

DHT dht(DHTPIN, DHTTYPE);
LiquidCrystal_I2C lcd(0x27, 16, 2);

unsigned long lastSendTime = 0;
const unsigned long SEND_INTERVAL = 5000;   // envia a cada 5 segundos
String statusEnvio = "--";

void setup() {
  Serial.begin(115200);
  dht.begin();
  lcd.init();
  lcd.backlight();
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_RED, OUTPUT);

  lcd.setCursor(0, 0); lcd.print("PetSense v2.0");
  lcd.setCursor(0, 1); lcd.print("CLYVO VET");
  delay(1500);

  lcd.clear(); lcd.print("Conectando WiFi");
  WiFi.begin(ssid, password, 6);   // canal 6: conexão mais rápida na rede Wokwi-GUEST
  int tentativas = 0;
  while (WiFi.status() != WL_CONNECTED && tentativas < 60) {
    delay(500);
    Serial.print(".");
    tentativas++;
  }

  lcd.clear();
  if (WiFi.status() == WL_CONNECTED) {
    lcd.print("WiFi OK!");
    Serial.println("\nWiFi conectado");
  } else {
    lcd.print("Modo Offline");
    Serial.println("\nSem WiFi - modo offline");
  }
  delay(1500);
}

void loop() {
  float temperatura = dht.readTemperature();
  if (isnan(temperatura)) {
    temperatura = 38.2 + (random(-20, 30) / 100.0);  // fallback de simulação
  }

  int potValue = analogRead(POT_PIN);
  int bpm = map(potValue, 0, 4095, 40, 200);          // 40 a 200 bpm

  bool alerta = (temperatura < TEMP_MIN || temperatura > TEMP_MAX || bpm < BPM_MIN || bpm > BPM_MAX);

  digitalWrite(LED_GREEN, alerta ? LOW : HIGH);
  digitalWrite(LED_RED, alerta ? HIGH : LOW);

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("T:"); lcd.print(temperatura, 1); lcd.print("C ");
  lcd.print(alerta ? "!ALERT" : "OK");
  lcd.setCursor(0, 1);
  lcd.print("BPM:"); lcd.print(bpm); lcd.print(" "); lcd.print(statusEnvio);

  Serial.printf("T=%.1f C | BPM=%d | %s\n", temperatura, bpm, alerta ? "ALERTA" : "normal");

  if (millis() - lastSendTime >= SEND_INTERVAL) {
    lastSendTime = millis();
    enviarLeitura(temperatura, bpm);
  }

  delay(1000);
}

// Chama a função SQL registrar_leitura via PostgREST (HTTPS)
void enviarLeitura(float temperatura, int bpm) {
  if (WiFi.status() != WL_CONNECTED) {
    statusEnvio = "off";
    Serial.println("Sem WiFi - tentando reconectar...");
    WiFi.disconnect();
    WiFi.begin(ssid, password, 6);
    return;
  }

  WiFiClientSecure client;
  client.setInsecure();   // simulação no Wokwi: sem validação de certificado
  HTTPClient http;

  String url = String(SUPABASE_URL) + "/rest/v1/rpc/registrar_leitura";
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);

  String corpo = String("{\"p_token\":\"") + DEVICE_TOKEN +
                 "\",\"p_temperatura\":" + String(temperatura, 1) +
                 ",\"p_bpm\":" + String(bpm) + "}";

  int codigo = http.POST(corpo);
  if (codigo == 200) {
    statusEnvio = "ok";
    Serial.println("Leitura enviada: " + http.getString());
  } else {
    statusEnvio = "E" + String(codigo);
    Serial.println("Erro HTTP " + String(codigo) + ": " + http.getString());
  }
  http.end();
}
