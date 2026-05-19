import { FeaturePlaceholder } from '@/components/common/FeaturePlaceholder';
import { AppScreen } from '@/components/ui/AppScreen';

export function MissionDetailScreen() {
  return (
    <AppScreen>
      <FeaturePlaceholder
        title='Mission Detail'
        description='Detalle de una mision con informacion logistica, responsables y estado de ejecucion.'
      />
    </AppScreen>
  );
}