import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../types';

const STORAGE_KEYS = {
  USER: '@user_data',
} as const;

export const storageService = {
  async saveUser(user: User): Promise<void> {
    try {
      const userString = JSON.stringify(user);
      await AsyncStorage.setItem(STORAGE_KEYS.USER, userString);
    } catch (error) {
      console.error('Error saving user to storage:', error);
    }
  },

  async getUser(): Promise<User | null> {
    try {
      const userString = await AsyncStorage.getItem(STORAGE_KEYS.USER);
      if (userString) {
        const user = JSON.parse(userString) as User;
        // Date型に変換
        return {
          ...user,
          createdAt: new Date(user.createdAt),
        };
      }
      return null;
    } catch (error) {
      console.error('Error getting user from storage:', error);
      return null;
    }
  },

  async updateUserField<K extends keyof User>(field: K, value: User[K]): Promise<void> {
    try {
      const user = await this.getUser();
      if (user) {
        const updatedUser = {
          ...user,
          [field]: value,
        };
        await this.saveUser(updatedUser);
      }
    } catch (error) {
      console.error('Error updating user field in storage:', error);
    }
  },

  async clearUser(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.USER);
    } catch (error) {
      console.error('Error clearing user from storage:', error);
    }
  },
}; 