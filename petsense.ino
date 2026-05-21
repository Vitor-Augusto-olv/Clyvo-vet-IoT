/*
 * PetSense - Monitor IoT de Saúde do Pet
 * CLYVO VET | Challenge FIAP 2026
 * 
 * Componentes simulados no Wokwi:
 *   - ESP32
 *   - Sensor de temperatura (DHT22 simulando temperatura corporal)
 *   - Potenciômetro simulando frequência cardíaca (BPM)
 *   - LED verde (normal) e LED vermelho (alerta)
 *   - Display LCD 16x2 (I2C)
 *
 * Conexões:
 *   DHT22  -> GPIO 4
 *   POT    -> GPIO 34 (ADC)
 *   LED Verde  -> GPIO 2
 *   LED Vermelho -> GPIO 15
 *   LCD SDA -> GPIO 21
 *   LCD SCL -> GPIO 22
 */

#include <DHT.h>
#include <LiquidCrystal_I2C.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ---- Configurações de pinos ----
#define DHTPIN 4
#define DHTTYPE DHT22
#define POT_PIN 34
#define LED_GREEN 2
#define LED_RED 15

// ---- WiFi (Wokwi usa rede simulada) ----
const char* ssid = "Wokwi-GUEST";
const char* password = "";

// ---- URL do servidor (Dashboard local ou ngrok) ----
// Em ambiente real: substitua pelo IP do seu servidor
const char* serverUrl = "http://YOUR_SERVER_IP:5000/data";

// ---- Limites de saúde do pet ----
const float TEMP_MIN = 37.5;
const float TEMP_MAX = 39.5;
const int BPM_MIN = 60;
const int BPM_MAX = 140;

DHT dht(DHTPIN, DHTTYPE);
LiquidCrystal_I2C lcd(0x27, 16, 2);

unsigned long lastSendTime = 0;
const unsigned long SEND_INTERVAL = 3000; // envia a cada 3 segundos

void setup() {
  Serial.begin(115200);
  
  dht.begin();
  
  lcd.init();
  lcd.backlight();
  
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_RED, OUTPUT);
  
  lcd.setCursor(0, 0);
  lcd.print("PetSense v1.0");
  lcd.setCursor(0, 1);
  lcd.print("CLYVO VET");
  delay(2000);
  
  // Conecta WiFi
  lcd.clear();
  lcd.print("Conectando WiFi");
  WiFi.begin(ssid, password);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    lcd.clear();
    lcd.print("WiFi OK!");
    lcd.setCursor(0, 1);
    lcd.print(WiFi.localIP());
    Serial.println("\nWiFi conectado: " + WiFi.localIP().toString());
  } else {
    lcd.clear();
    lcd.print("Modo Offline");
    Serial.println("\nSem WiFi - modo offline");
  }
  delay(2000);
}

void loop() {
  // Leitura do sensor de temperatura (DHT22)
  float temperatura = dht.readTemperature();
  
  // Se a leitura falhar, gera valor simulado realista
  if (isnan(temperatura)) {
    temperatura = 38.2 + (random(-20, 30) / 100.0);
  }

  // Leitura do potenciômetro -> mapeado para BPM (60-160)
  int potValue = analogRead(POT_PIN);
  int bpm = map(potValue, 0, 4095, 60, 160);

  // Lógica de alerta
  bool alerta = (temperatura < TEMP_MIN || temperatura > TEMP_MAX ||
                 bpm < BPM_MIN || bpm > BPM_MAX);

  // Controle dos LEDs
  if (alerta) {
    digitalWrite(LED_GREEN, LOW);
    digitalWrite(LED_RED, HIGH);
  } else {
    digitalWrite(LED_GREEN, HIGH);
    digitalWrite(LED_RED, LOW);
  }

  // Exibe no LCD
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("T:");
  lcd.print(temperatura, 1);
  lcd.print("C  ");
  lcd.print(alerta ? "!ALERT" : "OK");
  
  lcd.setCursor(0, 1);
  lcd.print("BPM:");
  lcd.print(bpm);
  lcd.print("        ");

  // Log no Serial (útil para debug no Wokwi)
  Serial.println("=== PetSense ===");
  Serial.print("Temperatura: "); Serial.print(temperatura); Serial.println(" °C");
  Serial.print("BPM: "); Serial.println(bpm);
  Serial.print("Status: "); Serial.println(alerta ? "ALERTA" : "Normal");
  Serial.println();

  // Envia dados HTTP a cada SEND_INTERVAL ms
  if (millis() - lastSendTime >= SEND_INTERVAL) {
    lastSendTime = millis();
    enviarDados(temperatura, bpm, alerta);
  }

  delay(1000);
}

void enviarDados(float temp, int bpm, bool alerta) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(serverUrl);
  http.addHeader("Content-Type", "application/json");

  // Monta JSON
  StaticJsonDocument<200> doc;
  doc["temperatura"] = temp;
  doc["bpm"] = bpm;
  doc["alerta"] = alerta;
  doc["pet_id"] = "pet_001";
  doc["timestamp"] = millis();

  String payload;
  serializeJson(doc, payload);

  int httpCode = http.POST(payload);
  
  if (httpCode == 200) {
    Serial.println("Dados enviados com sucesso!");
  } else {
    Serial.print("Erro HTTP: ");
    Serial.println(httpCode);
  }

  http.end();
}
