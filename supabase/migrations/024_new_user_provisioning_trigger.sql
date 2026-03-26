CREATE OR REPLACE FUNCTION provision_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO invoice_sequence (user_id, last_number) VALUES (NEW.id, 0);
    INSERT INTO business_details (user_id, business_name, abn, address, bsb, account_number,
                                   super_fund, super_member_number, super_fund_abn, super_usi)
    VALUES (NEW.id, '', '', '', '', '', '', '', '', '');
    RETURN NEW;
END; $$;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION provision_new_user();
