import { FeaturePlaceholder } from '@/components/common/FeaturePlaceholder';
import { AppScreen } from '@/components/ui/AppScreen';

export function VolunteersScreen() {
  return (
    <AppScreen>
      <FeaturePlaceholder
        title='Volunteers'
        description='Vista para que organizadores administren voluntarios asignados y el estado de sus tareas.'
      />
    </AppScreen>
  );
}