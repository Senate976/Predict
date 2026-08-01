import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';
import { Platform } from 'react-native';

import { supabase } from './supabase';

const VALID_OTP_TYPES = new Set([
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
]);
type OtpType = 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email';

/**
 * Finalise le retour du lien de confirmation d'email, sur le web uniquement.
 *
 * Deux formats possibles selon le modèle d'email configuré côté Supabase :
 * - historique — le lien passe par le serveur d'auth Supabase, qui valide et
 *   redirige vers le site avec les jetons dans le fragment d'URL
 *   (`#access_token=...`). `detectSessionInUrl` (lib/supabase.ts) les récupère
 *   normalement tout seul ; on s'assure ici que rien ne l'en empêche (ex. un
 *   redéploiement du site pas encore propagé au moment du clic).
 * - récent — le lien pointe directement sur le site avec `token_hash`/`type`
 *   en paramètres de requête, et c'est au client de finaliser la vérification
 *   via `verifyOtp`. Sans ce traitement, cliquer le lien atterrit sur le site
 *   sans qu'aucune session ne s'ouvre.
 *
 * Dans les deux cas, l'URL est nettoyée ensuite (`replaceState`) pour ne pas
 * laisser de jeton trainer dans l'historique du navigateur.
 */
async function consumeEmailConfirmationFromUrl() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;

  const { hash, search, pathname } = window.location;

  if (hash.includes('access_token')) {
    const params = new URLSearchParams(hash.slice(1));
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (access_token && refresh_token) {
      await supabase.auth.setSession({ access_token, refresh_token });
    }
    window.history.replaceState(null, '', pathname);
    return;
  }

  const params = new URLSearchParams(search);
  const tokenHash = params.get('token_hash');
  const type = params.get('type');
  if (tokenHash && type && VALID_OTP_TYPES.has(type)) {
    await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as OtpType });
    params.delete('token_hash');
    params.delete('type');
    const rest = params.toString();
    window.history.replaceState(null, '', pathname + (rest ? `?${rest}` : ''));
  }
}

type AuthContextValue = {
  session: Session | null;
  /** Username lu dans la table `profiles`, null tant qu'il n'est pas chargé. */
  username: string | null;
  /**
   * `false` juste après l'inscription (valeur par défaut en base) : c'est ce
   * qui déclenche l'écran de bienvenue. `null` tant que le profil n'est pas
   * encore chargé — ne rien afficher dans ce cas, pour ne pas faire clignoter
   * la modale à l'ouverture.
   */
  onboarded: boolean | null;
  /** Marque l'accueil comme vu : à appeler à la fermeture de la modale. */
  markOnboarded: () => Promise<void>;
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
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Doit passer avant `getSession()` : c'est ce qui établit la session à
      // partir du lien de confirmation d'email, le cas échéant.
      await consumeEmailConfirmationFromUrl();
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setSession(data.session);
      setLoading(false);
    })();

    // Couvre login, logout, refresh de token et mise à jour utilisateur.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) {
      setUsername(null);
      setOnboarded(null);
      return;
    }

    let cancelled = false;

    supabase
      .from('profiles')
      .select('username, onboarded')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('Lecture du profil impossible :', error.message);
          setUsername(null);
          setOnboarded(null);
          return;
        }
        // Repli sur les metadata : utile juste après une inscription avec
        // confirmation d'email, quand la ligne `profiles` est créée par un
        // trigger qui n'a pas encore tourné.
        const metadataUsername = session?.user.user_metadata?.username;
        setUsername(data?.username ?? metadataUsername ?? null);
        setOnboarded(data?.onboarded ?? false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const markOnboarded = async () => {
    if (!userId) return;
    setOnboarded(true);
    const { error } = await supabase.from('profiles').update({ onboarded: true }).eq('id', userId);
    if (error) console.warn('Marquage de l’accueil impossible :', error.message);
  };

  return (
    <AuthContext.Provider
      value={{ session, username, onboarded, markOnboarded, loading, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}
