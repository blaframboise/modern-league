import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { importHandler } from './handler.ts';
Deno.serve(importHandler(name => Deno.env.get(name), createClient));
