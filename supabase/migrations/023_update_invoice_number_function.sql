CREATE OR REPLACE FUNCTION next_invoice_number()
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE next_num integer;
BEGIN
    UPDATE invoice_sequence
    SET last_number = last_number + 1
    WHERE user_id = auth.uid()
    RETURNING last_number INTO next_num;

    IF next_num IS NULL THEN
        RAISE EXCEPTION 'No invoice_sequence row found for current user';
    END IF;
    RETURN next_num;
END; $$;
