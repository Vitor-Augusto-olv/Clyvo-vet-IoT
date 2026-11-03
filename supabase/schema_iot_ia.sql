-- Clyvo Vet - IoT + IA (Sprint 4)
-- Rode no SQL Editor do Supabase. Pré-requisito: schema_sprint4.sql e schema_sprint4_fase2.sql já aplicados.
-- Atualiza a função chamada pelo ESP32 para:
--   1) validar a faixa dos valores recebidos (descarta leituras absurdas);
--   2) usar limites de alerta por espécie, iguais aos do motor de regras da IA.

create or replace function public.registrar_leitura(
  p_token text, p_temperatura numeric, p_bpm integer
) returns json
language plpgsql security definer set search_path = public as $$
declare
  d public.dispositivos%rowtype;
  v_especie text;
  v_tmin numeric; v_tmax numeric; v_bmin integer; v_bmax integer;
  v_alerta boolean;
begin
  select * into d from public.dispositivos where token = p_token;
  if not found then
    raise exception 'token invalido' using errcode = '28000';
  end if;

  if p_temperatura < 30 or p_temperatura > 45 or p_bpm < 20 or p_bpm > 300 then
    raise exception 'leitura fora da faixa fisica' using errcode = '22003';
  end if;

  select lower(coalesce(especie, '')) into v_especie from public.pets where id = d.pet_id;

  if v_especie like '%gat%' then
    v_tmin := 38.0; v_tmax := 39.5; v_bmin := 120; v_bmax := 220;   -- gato
  else
    v_tmin := 37.5; v_tmax := 39.5; v_bmin := 60;  v_bmax := 140;   -- cao
  end if;

  v_alerta := p_temperatura < v_tmin or p_temperatura > v_tmax
           or p_bpm < v_bmin or p_bpm > v_bmax;

  insert into public.leituras_iot(dispositivo_id, user_id, pet_id, temperatura, bpm, alerta)
  values (d.id, d.user_id, d.pet_id, p_temperatura, p_bpm, v_alerta);

  return json_build_object('ok', true, 'alerta', v_alerta);
end $$;

grant execute on function public.registrar_leitura(text, numeric, integer) to anon, authenticated;
