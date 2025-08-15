#import <Foundation/Foundation.h>
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

  NSMutableArray *arr = [NSMutableArray arrayWithArray:[ud arrayForKey:@"SHARED_INBOX_ITEMS"] ?: @[]];
  NSMutableDictionary *mut = [item mutableCopy];
  if (!mut[@"ts"]) {
    long long ms = (long long)([[NSDate date] timeIntervalSince1970] * 1000.0);
    mut[@"ts"] = @(ms);
  }
  [arr addObject:mut];
  [ud setObject:arr forKey:@"SHARED_INBOX_ITEMS"];
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
  NSArray *arr = [ud arrayForKey:@"SHARED_INBOX_ITEMS"] ?: @[];
  [ud setObject:@[] forKey:@"SHARED_INBOX_ITEMS"];
  [ud synchronize];
  resolve(arr);
}
@end
