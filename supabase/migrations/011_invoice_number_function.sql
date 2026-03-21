CREATE OR REPLACE FUNCTION next_invoice_number()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    next_num integer;
BEGIN
    UPDATE invoice_sequence
    SET last_number = last_number + 1
    RETURNING last_number INTO next_num;
    RETURN next_num;
END;
$$;
