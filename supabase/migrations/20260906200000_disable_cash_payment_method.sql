-- Migration: Desativa o método de pagamento 'Dinheiro', mantendo exclusivamente o 'PIX' ativo no sistema
update public.payment_methods
set active = false
where lower(name) = 'dinheiro';
