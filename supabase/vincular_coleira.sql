-- Vincula uma coleira PetSense (ESP32) a um pet e devolve o TOKEN do dispositivo.
-- Rode no SQL Editor do Supabase. Troque 'Thor' pelo nome do seu pet.
-- Copie o token retornado para a constante DEVICE_TOKEN do petsense.ino (NÃO commite o token real).

insert into public.dispositivos (user_id, pet_id, nome)
select user_id, id, 'Coleira PetSense'
from public.pets
where nome = 'Thor'
order by created_at desc
limit 1
returning id, pet_id, token;
