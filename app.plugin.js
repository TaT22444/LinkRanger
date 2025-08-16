// app.plugin.js
const { withXcodeProject, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const TARGET_NAME = 'WinkShareExtension';
const PHASE_NAME = 'Bundle React Native code and images (Share Extension)';

// Debugでも必ず同梱バンドルを読ませるため、main.jsbundleを出力
const SHELL_SCRIPT = `export NODE_BINARY=node
export ENTRY_FILE=index.share.js
export BUNDLE_FILE="$CONFIGURATION_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/main.jsbundle"
export ASSETS_DIR="$CONFIGURATION_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH"
"$SRCROOT/../node_modules/react-native/scripts/react-native-xcode.sh" \\
  --entry-file "$ENTRY_FILE" \\
  --platform ios \\
  --dev false \\
  --bundle-output "$BUNDLE_FILE" \\
  --assets-dest "$ASSETS_DIR"
`;

function findTargetUUIDByName(project, name) {
  const section = project.pbxNativeTargetSection();
  for (const [key, value] of Object.entries(section)) {
    if (typeof value !== 'object') continue; // skip comments
    const targetName = (value.name || '').replace(/"/g, '');
    if (targetName === name) return key;
  }
  return null;
}

function getBuildPhases(project, targetUuid) {
  const nativeTarget = project.getPBXObject('PBXNativeTarget', targetUuid);
  if (!nativeTarget || !nativeTarget.buildPhases) return [];
  return nativeTarget.buildPhases.map((ph) => ph.value);
}

function getShellScriptPhaseObjects(project) {
  const phases = project.hash.project.objects.PBXShellScriptBuildPhase || {};
  return Object.entries(phases)
    .filter(([k]) => !k.endsWith('_comment'))
    .map(([uuid, obj]) => ({ uuid, obj }));
}

function findShellScriptPhaseByName(project, targetUuid, phaseName) {
  const phaseUUIDs = new Set(getBuildPhases(project, targetUuid));
  const allShells = getShellScriptPhaseObjects(project);
  for (const { uuid, obj } of allShells) {
    const name = (obj.name || obj.comment || '').replace(/"/g, '');
    if (name === phaseName && phaseUUIDs.has(uuid)) {
      return { uuid, obj };
    }
  }
  return null;
}

function removeDebugFromSwiftConditions(project, targetUuid) {
  const cfgLists = project.hash.project.objects.XCConfigurationList || {};
  const nativeTargets = project.pbxNativeTargetSection()[targetUuid];
  const buildConfigurationListId = nativeTargets.buildConfigurationList;
  const cfgList = cfgLists[buildConfigurationListId];
  if (!cfgList || !cfgList.buildConfigurations) return;

  const buildConfigs = project.hash.project.objects.XCBuildConfiguration || {};
  for (const { value: cfgId } of cfgList.buildConfigurations) {
    const cfg = buildConfigs[cfgId];
    if (!cfg || !cfg.buildSettings) continue;

    const key = 'SWIFT_ACTIVE_COMPILATION_CONDITIONS';
    let cond = cfg.buildSettings[key];
    if (!cond) continue;

    if (Array.isArray(cond)) {
      cfg.buildSettings[key] = cond.filter((t) => t !== 'DEBUG');
    } else if (typeof cond === 'string') {
      const parts = cond.split(/\s+/).filter(Boolean).filter((t) => t !== 'DEBUG');
      cfg.buildSettings[key] = parts.join(' ');
    }
  }
}

const withShareExtensionConfig = (config) =>
  withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;

    // 1) 拡張ターゲット取得
    const targetUuid = findTargetUUIDByName(project, TARGET_NAME);
    if (!targetUuid) {
      console.warn(`[app.plugin] iOS target "${TARGET_NAME}" not found. Skipping.`);
      return cfg;
    }

    // 2) Run Script 追加/更新（main.jsbundle を必ず出力）
    const existing = findShellScriptPhaseByName(project, targetUuid, PHASE_NAME);
    if (existing) {
      existing.obj.shellPath = '/bin/sh';
      existing.obj.shellScript = JSON.stringify(SHELL_SCRIPT);
      if (!Array.isArray(existing.obj.inputPaths)) existing.obj.inputPaths = [];
      if (!Array.isArray(existing.obj.outputPaths)) existing.obj.outputPaths = [];
      existing.obj.alwaysOutOfDate = 1;
    } else {
      const phase = project.addBuildPhase(
        [],
        'PBXShellScriptBuildPhase',
        PHASE_NAME,
        targetUuid,
        undefined,
        {
          shellPath: '/bin/sh',
          shellScript: JSON.stringify(SHELL_SCRIPT),
          runOnlyForDeploymentPostprocessing: 0,
          inputPaths: [],
          outputPaths: [],
        }
      );
      const phases = project.hash.project.objects.PBXShellScriptBuildPhase;
      if (phase && phases && phases[phase.uuid]) {
        phases[phase.uuid].alwaysOutOfDate = 1;
      }
    }

    // 3) DebugでもMetroに繋がらないように、DEBUGフラグを拡張ターゲットから外す
    removeDebugFromSwiftConditions(project, targetUuid);

    return cfg;
  });

module.exports = withShareExtensionConfig;
module.exports.default = withShareExtensionConfig; 
