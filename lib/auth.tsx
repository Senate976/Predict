import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';

import { supabase } from './supabase';

type AuthContextValue = {
  session: Session | null;
  /** Username lu dans la table `profiles`, null tant qu'il n'est pas chargé. */
  username: string | null;
  /** true pendant la restauration de la session au démarrage. */
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth doit être utilisé dans un <AuthProvider>.');
  }
  return value;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Session restaurée depuis AsyncStorage au démarrage.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    // Couvre login, logout, refresh de token et mise à jour utilisateur.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) {
      setUsername(null);
      return;
    }

    let cancelled = false;

    supabase
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('Lecture du profil impossible :', error.message);
          setUsername(null);
          return;
        }
        // Repli sur les metadata : utile juste après une inscription avec
        // confirmation d'email, quand la ligne `profiles` est créée par un
        // trigger qui n'a pas encore tourné.
        const metadataUsername = session?.user.user_metadata?.username;
        setUsername(data?.username ?? metadataUsername ?? null);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ session, username, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
