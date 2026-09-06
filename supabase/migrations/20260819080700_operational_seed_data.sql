insert into public.payment_methods (name) values
  ('PIX'),
  ('Dinheiro')
on conflict (name) do nothing;

insert into public.financial_categories (kind, name) values
  ('INCOME', 'Rifa'),
  ('INCOME', 'Eventos'),
  ('INCOME', 'Contribuições'),
  ('INCOME', 'Patrocínio'),
  ('INCOME', 'Outros'),
  ('EXPENSE', 'Buffet'),
  ('EXPENSE', 'Decoração'),
  ('EXPENSE', 'Local'),
  ('EXPENSE', 'Fotografia'),
  ('EXPENSE', 'Música'),
  ('EXPENSE', 'Convites'),
  ('EXPENSE', 'Transporte'),
  ('EXPENSE', 'Taxas'),
  ('EXPENSE', 'Outros')
on conflict (kind, name) do nothing;
