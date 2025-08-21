// 分割されたサービスの統合エクスポート
export { userService } from './userService';
export { linkService } from './linkService';
export { tagService } from './tagService';

// 他のサービスは元のfirestoreService.tsから継続使用（段階的移行）
export { 
  folderService, 
  searchService, 
  settingsService, 
  batchService, 

} from './firestoreService';

// 共通ユーティリティ
export { COLLECTIONS, convertToLink } from './firestoreUtils';