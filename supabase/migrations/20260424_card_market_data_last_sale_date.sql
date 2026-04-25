ALTER TABLE card_market_data
  ADD COLUMN IF NOT EXISTS last_sale_date date;
