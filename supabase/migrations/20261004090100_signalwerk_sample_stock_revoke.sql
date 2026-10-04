-- Rechte nachgezogen (Prüfung 04.10.2026): mark_sample_stock_checked und discard_sample_stock (20261004000000) laufen
-- als security definer, hatten aber kein revoke – Postgres gibt neuen Funktionen standardmäßig execute an public.
-- Wie bei claim_/expire_sample_stock: nur service_role darf sie aufrufen. Nicht destruktiv: nur Rechte enger.
revoke all on function signalwerk.mark_sample_stock_checked(uuid) from public, anon, authenticated;
revoke all on function signalwerk.discard_sample_stock(uuid, text) from public, anon, authenticated;
grant execute on function signalwerk.mark_sample_stock_checked(uuid) to service_role;
grant execute on function signalwerk.discard_sample_stock(uuid, text) to service_role;
