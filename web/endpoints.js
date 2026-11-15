// Preset endpoints for the settings drop-downs. A saved value that is not a
// preset is shown as "Custom" with the text box filled in.

export const CUSTOM = '__custom__';

export const ACR_HOSTS = [
  { value: 'identify-us-west-2.acrcloud.com', label: 'US West (identify-us-west-2)' },
  { value: 'identify-eu-west-1.acrcloud.com', label: 'Europe (identify-eu-west-1)' },
  { value: 'identify-ap-southeast-1.acrcloud.com', label: 'Asia Pacific (identify-ap-southeast-1)' },
];

export const AUDD_ENDPOINTS = [
  { value: '', label: 'Automatic (relay when available)' },
  { value: 'https://api.audd.io/', label: 'AudD direct (api.audd.io)' },
];

// Which drop-down option a saved value maps to, and what the custom box holds.
export function selectionFor(presets, saved = '') {
  if (presets.some((p) => p.value === saved)) return { choice: saved, custom: '' };
  return { choice: CUSTOM, custom: saved };
}

// The value to save from the drop-down and the custom box.
export function valueFor(choice, custom = '') {
  return choice === CUSTOM ? custom.trim() : choice;
}
