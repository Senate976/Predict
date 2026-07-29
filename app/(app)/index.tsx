import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../lib/auth';

export default function HomeScreen() {
  const { username, session, signOut } = useAuth();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>
          Bienvenue {username ?? session?.user.email ?? ''}
        </Text>
        <Text style={styles.subtitle}>Le fil d'actualité arrive bientôt.</Text>

        <Pressable
          onPress={signOut}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonText}>Se déconnecter</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  title: { fontSize: 24, fontWeight: '700', color: '#111' },
  subtitle: { fontSize: 15, color: '#6b7280', marginBottom: 24 },
  button: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  buttonPressed: { backgroundColor: '#f3f4f6' },
  buttonText: { fontSize: 15, fontWeight: '600', color: '#374151' },
});
