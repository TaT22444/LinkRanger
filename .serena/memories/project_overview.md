# LinkRanger - プロジェクト概要

## プロジェクトの目的
LinkRanger は React Native (Expo) で構築されたリンク管理アプリです。ユーザーがリンクを保存・整理し、AI機能でタグ付けや要約を行うことができます。

## 技術スタック
- **フレームワーク**: React Native + Expo (~53.0.13)
- **言語**: TypeScript
- **データベース**: Firebase Firestore
- **認証**: Firebase Auth (Google Sign-in, Apple Authentication対応)
- **通知**: expo-notifications
- **状態管理**: React Context API
- **ナビゲーション**: React Navigation 7
- **支払い**: react-native-iap (Apple Pay対応)

## 主要機能
1. **リンク管理**: URLの保存、整理、タグ付け
2. **AI機能**: 自動タグ付け、要約生成、解説機能
3. **ユーザープラン**: Free/Plus/Pro の3段階プラン
4. **通知システム**: 3日間未アクセス通知機能
5. **認証**: Google、Apple認証対応

## アーキテクチャ
- **Services層**: ビジネスロジックを管理 (src/services/)
- **Components層**: 再利用可能なUIコンポーネント
- **Screens層**: 画面単位のコンポーネント
- **Types**: TypeScript型定義 (src/types/index.ts)
- **Contexts**: React Context (認証など)