// app.shared-inbox.plugin.js
const { withXcodeProject, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const TARGET_NAME = 'WinkShareExtension'; // ← ここをプロジェクトに合わせる
const NATIVE_FILE = 'SharedInbox.m';
const INBOX_KEY = 'SHARED_INBOX_ITEMS';

const OBJC_CODE = `#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

@interface SharedInbox : NSObject <RCTBridgeModule>
@end

@implementation SharedInbox
RCT_EXPORT_MODULE();

RCT_EXPORT_METHOD(save:(NSString *)groupId
                  item:(NSDictionary *)item
              resolver:(RCTPromiseResolveBlock)resolve
              rejecter:(RCTPromiseRejectBlock)reject)
{
  if (!groupId) { reject(@"no_group", @"Invalid app group", nil); return; }
  NSUserDefaults *ud = [[NSUserDefaults alloc] initWithSuiteName:groupId];
  if (!ud) { reject(@"no_group", @"Invalid app group", nil); return; }

  NSMutableArray *arr = [NSMutableArray arrayWithArray:[ud arrayForKey:@"${INBOX_KEY}"] ?: @[]];
  NSMutableDictionary *mut = [item mutableCopy];
  if (!mut[@"ts"]) {
    long long ms = (long long)([[NSDate date] timeIntervalSince1970] * 1000.0);
    mut[@"ts"] = @(ms);
  }
  [arr addObject:mut];
  [ud setObject:arr forKey:@"${INBOX_KEY}"];
  [ud synchronize];
  resolve(@(YES));
}

RCT_EXPORT_METHOD(readAndClear:(NSString *)groupId
              resolver:(RCTPromiseResolveBlock)resolve
              rejecter:(RCTPromiseRejectBlock)reject)
{
  if (!groupId) { reject(@"no_group", @"Invalid app group", nil); return; }
  NSUserDefaults *ud = [[NSUserDefaults alloc] initWithSuiteName:groupId];
  if (!ud) { reject(@"no_group", @"Invalid app group", nil); return; }
  NSArray *arr = [ud arrayForKey:@"${INBOX_KEY}"] ?: @[];
  [ud setObject:@[] forKey:@"${INBOX_KEY}"];
  [ud synchronize];
  resolve(arr);
}
@end
`;

// --------- helpers ----------
function findTargetByProductType(project, productType) {
  const section = project.pbxNativeTargetSection();
  for (const k in section) {
    const t = section[k];
    if (typeof t !== 'object') continue;
    if ((t.productType || '').includes(productType)) {
      const name = String(t.name).replace(/"/g, '');
      return { uuid: k, name };
    }
  }
  return null;
}

function findTargetByName(project, name) {
  const section = project.pbxNativeTargetSection();
  for (const k in section) {
    const t = section[k];
    if (typeof t !== 'object') continue;
    const n = String(t.name).replace(/"/g, '');
    if (n === name) return { uuid: k, name: n };
  }
  return null;
}

// そのターゲットの Sources に既に入っているか（コメントで判定）
function hasSourceInTarget(project, targetUuid, fileName) {
  const phase = project.pbxSourcesBuildPhaseObj(targetUuid);
  const files = phase?.files || [];
  return files.some((f) => String(f.comment) === `${fileName} in Sources`);
}

// 重要：相対パス + グループ名（CustomTemplate）を指定して追加
function addSourceToTarget(project, targetUuid, fileName) {
  if (hasSourceInTarget(project, targetUuid, fileName)) return;
  // 第3引数でグループを指定すると、plugins path 補正に入らず安全に追加できる
  project.addSourceFile(fileName, { target: targetUuid }, 'CustomTemplate');
}

// --------- mods ----------
const withSharedInboxFile = (config) =>
  withDangerousMod(config, [
    'ios',
    (cfg) => {
      const iosDir = cfg.modRequest.platformProjectRoot;
      const filePath = path.join(iosDir, NATIVE_FILE);
      if (!fs.existsSync(filePath) || fs.readFileSync(filePath, 'utf8') !== OBJC_CODE) {
        fs.writeFileSync(filePath, OBJC_CODE);
        console.log(`[shared-inbox.plugin] wrote ${NATIVE_FILE}`);
      }
      return cfg;
    },
  ]);

const withSharedInboxXcode = (config) =>
  withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;

    // メインアプリターゲット
    const appTarget = findTargetByProductType(project, 'com.apple.product-type.application');
    if (appTarget) {
      addSourceToTarget(project, appTarget.uuid, NATIVE_FILE);
    } else {
      console.warn('[shared-inbox.plugin] App target not found');
    }

    // Share Extension ターゲット
    const extTarget =
      findTargetByName(project, TARGET_NAME) ||
      findTargetByProductType(project, 'com.apple.product-type.app-extension');

    if (extTarget) {
      addSourceToTarget(project, extTarget.uuid, NATIVE_FILE);
    } else {
      console.warn(`[shared-inbox.plugin] Extension target "${EXT_TARGET_NAME}" not found`);
    }

    return cfg;
  });

module.exports = (config) => {
  config = withSharedInboxFile(config);
  config = withSharedInboxXcode(config);
  return config;
};