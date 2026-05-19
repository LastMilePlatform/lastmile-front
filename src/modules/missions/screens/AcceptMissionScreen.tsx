import { FeaturePlaceholder } from '@/components/common/FeaturePlaceholder';
import { AppScreen } from '@/components/ui/AppScreen';

export function AcceptMissionScreen() {
  return (
    <AppScreen>
      <FeaturePlaceholder
        title='Accept Mission'
        description='Flujo de confirmacion para aceptar una mision y actualizar disponibilidad del voluntario.'
      />
    </AppScreen>
  );
}