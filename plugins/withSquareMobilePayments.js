/**
 * Expo config plugin for Square's Mobile Payments SDK (Tap to Pay).
 *
 * Square's React Native package links itself, but the SDK also has to be
 * started from native launch code and needs a few permissions and build steps.
 * This does all of that at prebuild time, so the ios/ and android/ folders stay
 * generated (nothing native is committed):
 *
 *  - iOS: starts the SDK in AppDelegate, adds the Bluetooth / location /
 *    microphone usage strings, and appends Square's "setup" run-script after
 *    CocoaPods embeds the frameworks (a Podfile post_integrate hook, because
 *    CocoaPods adds its own build phases after prebuild runs).
 *  - iOS, only when `tapToPayOnIphone` is true: adds Apple's Tap to Pay on
 *    iPhone entitlement. Leave it off until Apple has approved the entitlement
 *    for this app — signing fails with it before then.
 *  - Android: starts the SDK in MainApplication and adds the permissions.
 *    The Square Maven repo, Kotlin 2.2 and minSdk 28 come from
 *    expo-build-properties (see app.config.js).
 *
 * Options: { applicationId: string, tapToPayOnIphone?: boolean }
 * With no applicationId the plugin does nothing, and the app reports card
 * payments as not set up instead of starting an unconfigured SDK.
 */
const {
  AndroidConfig,
  withAndroidManifest,
  withAppDelegate,
  withDangerousMod,
  withEntitlementsPlist,
  withInfoPlist,
  withMainApplication,
} = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARK = 'Square Mobile Payments SDK';

function swiftString(value) {
  return JSON.stringify(String(value));
}

function withIosInit(config, applicationId) {
  return withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== 'swift') {
      throw new Error(`${MARK}: expected a Swift AppDelegate, got ${cfg.modResults.language}`);
    }
    let src = cfg.modResults.contents;
    if (!src.includes('import SquareMobilePaymentsSDK')) {
      src = src.replace(/(import React\n)/, `$1import SquareMobilePaymentsSDK\n`);
    }
    if (!src.includes('MobilePaymentsSDK.initialize(')) {
      const anchor = /(didFinishLaunchingWithOptions launchOptions: \[UIApplication\.LaunchOptionsKey: Any\]\? = nil\n\s*\) -> Bool \{\n)/;
      if (!anchor.test(src)) throw new Error(`${MARK}: could not find didFinishLaunchingWithOptions in AppDelegate`);
      src = src.replace(
        anchor,
        `$1    // ${MARK}: must start before anything else uses it.\n` +
          `    MobilePaymentsSDK.initialize(applicationLaunchOptions: launchOptions, squareApplicationID: ${swiftString(applicationId)})\n\n`
      );
    }
    cfg.modResults.contents = src;
    return cfg;
  });
}

function withIosPlist(config) {
  return withInfoPlist(config, (cfg) => {
    const p = cfg.modResults;
    const set = (key, value) => {
      if (!p[key]) p[key] = value;
    };
    set('NSBluetoothAlwaysUsageDescription', 'Adaptivity connects to Square card readers over Bluetooth to take payments.');
    set('NSBluetoothPeripheralUsageDescription', 'Adaptivity connects to Square card readers over Bluetooth to take payments.');
    set('NSLocationWhenInUseUsageDescription', 'Adaptivity uses your location to confirm card payments and show dispatch progress.');
    set('NSMicrophoneUsageDescription', 'Square uses the microphone to read magstripe card readers.');
    return cfg;
  });
}

function withIosEntitlement(config) {
  return withEntitlementsPlist(config, (cfg) => {
    cfg.modResults['com.apple.developer.proximity-reader.payment.acceptance'] = true;
    return cfg;
  });
}

const POST_INTEGRATE = `
# ${MARK}: run Square's setup script after CocoaPods embeds the frameworks.
post_integrate do |installer|
  phase_name = '[Square] Mobile Payments SDK setup'
  installer.aggregate_targets.each do |aggregate|
    project = aggregate.user_project
    changed = false
    project.native_targets.each do |target|
      next unless target.product_type == 'com.apple.product-type.application'
      next if target.shell_script_build_phases.any? { |phase| phase.name == phase_name }
      phase = target.new_shell_script_build_phase(phase_name)
      phase.shell_path = '/bin/sh'
      phase.shell_script = <<~'SCRIPT'
        SETUP_SCRIPT="\${BUILT_PRODUCTS_DIR}/\${FRAMEWORKS_FOLDER_PATH}/SquareMobilePaymentsSDK.framework/setup"
        if [ -f "$SETUP_SCRIPT" ]; then
          "$SETUP_SCRIPT"
        fi
      SCRIPT
      changed = true
    end
    project.save if changed
  end
end
`;

function withIosSetupScript(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      const contents = fs.readFileSync(podfile, 'utf8');
      if (!contents.includes(MARK)) {
        if (/^\s*post_integrate\b/m.test(contents)) {
          throw new Error(`${MARK}: the Podfile already has a post_integrate hook — merge the Square setup phase into it`);
        }
        fs.writeFileSync(podfile, `${contents.trimEnd()}\n${POST_INTEGRATE}`);
      }
      return cfg;
    },
  ]);
}

function withAndroidInit(config, applicationId) {
  return withMainApplication(config, (cfg) => {
    if (cfg.modResults.language !== 'kt') {
      throw new Error(`${MARK}: expected a Kotlin MainApplication, got ${cfg.modResults.language}`);
    }
    let src = cfg.modResults.contents;
    if (!src.includes('import com.squareup.sdk.mobilepayments.MobilePaymentsSdk')) {
      src = src.replace(/(\nimport android\.app\.Application\n)/, `$1import com.squareup.sdk.mobilepayments.MobilePaymentsSdk\n`);
    }
    if (!src.includes('MobilePaymentsSdk.initialize(')) {
      const anchor = /(override fun onCreate\(\) \{\n\s*super\.onCreate\(\)\n)/;
      if (!anchor.test(src)) throw new Error(`${MARK}: could not find onCreate in MainApplication`);
      src = src.replace(
        anchor,
        `$1    // ${MARK}: must start before anything else uses it.\n` +
          `    MobilePaymentsSdk.initialize(${JSON.stringify(String(applicationId))}, this)\n`
      );
    }
    cfg.modResults.contents = src;
    return cfg;
  });
}

const ANDROID_PERMISSIONS = [
  'android.permission.INTERNET',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.RECORD_AUDIO',
  'android.permission.BLUETOOTH_CONNECT',
  'android.permission.BLUETOOTH_SCAN',
  'android.permission.READ_PHONE_STATE',
];

function withAndroidPermissions(config) {
  return withAndroidManifest(config, (cfg) => {
    AndroidConfig.Permissions.ensurePermissions(cfg.modResults, ANDROID_PERMISSIONS);
    return cfg;
  });
}

module.exports = function withSquareMobilePayments(config, options = {}) {
  const applicationId = String(options.applicationId || '').trim();
  if (!applicationId) return config;
  config = withIosInit(config, applicationId);
  config = withIosPlist(config);
  config = withIosSetupScript(config);
  if (options.tapToPayOnIphone) config = withIosEntitlement(config);
  config = withAndroidInit(config, applicationId);
  config = withAndroidPermissions(config);
  return config;
};
