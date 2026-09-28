import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BrowseScreen } from './src/screens/BrowseScreen';
import { CourseScreen } from './src/screens/CourseScreen';
import type { RootStackParamList } from './src/types/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ contentStyle: { backgroundColor: '#fff' } }}>
          <Stack.Screen name="Browse" component={BrowseScreen} options={{ title: 'Courses' }} />
          <Stack.Screen
            name="Course"
            component={CourseScreen}
            options={({ route }) => ({ title: route.params.code, headerBackTitle: 'Back' })}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
