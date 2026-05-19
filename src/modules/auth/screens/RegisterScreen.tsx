import { FeaturePlaceholder } from '@/components/common/FeaturePlaceholder';
import { AppScreen } from '@/components/ui/AppScreen';

export function RegisterScreen() {
  return (
    <AppScreen>
      <FeaturePlaceholder
        title='Register'
        description='Pantalla base de registro para nuevos voluntarios y organizadores.'
      />
    </AppScreen>
  );
}