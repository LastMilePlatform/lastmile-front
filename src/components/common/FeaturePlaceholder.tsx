import { Text, View } from 'react-native';

type FeaturePlaceholderProps = {
  title: string;
  description: string;
};

export function FeaturePlaceholder({
  title,
  description,
}: FeaturePlaceholderProps) {
  return (
    <View className='rounded-2xl border border-brand-100 bg-white p-5'>
      <Text className='text-2xl font-bold text-brand-700'>{title}</Text>
      <Text className='mt-2 text-base leading-6 text-slate-700'>{description}</Text>
    </View>
  );
}