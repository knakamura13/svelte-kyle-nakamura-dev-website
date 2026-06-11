import type { CustomThemeConfig } from '@skeletonlabs/tw-plugin';

/**
 * Custom Skeleton theme for kylenakamura.dev.
 *
 * Palette: indigo primary, cyan secondary, violet tertiary,
 * on a deep blue-slate surface for a modern dark look.
 */
export const nakamuraTheme: CustomThemeConfig = {
	name: 'nakamura',
	properties: {
		// =~= Theme Properties =~=
		'--theme-font-family-base': `ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`,
		'--theme-font-family-heading': `ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`,
		'--theme-font-color-base': '15 23 42',
		'--theme-font-color-dark': '226 232 240',
		'--theme-rounded-base': '8px',
		'--theme-rounded-container': '12px',
		'--theme-border-base': '1px',
		// =~= Theme On-X Colors =~=
		'--on-primary': '255 255 255',
		'--on-secondary': '0 0 0',
		'--on-tertiary': '255 255 255',
		'--on-success': '0 0 0',
		'--on-warning': '0 0 0',
		'--on-error': '255 255 255',
		'--on-surface': '255 255 255',
		// =~= Theme Colors =~=
		// primary | #6366f1 (indigo)
		'--color-primary-50': '238 242 255',
		'--color-primary-100': '224 231 255',
		'--color-primary-200': '199 210 254',
		'--color-primary-300': '165 180 252',
		'--color-primary-400': '129 140 248',
		'--color-primary-500': '99 102 241',
		'--color-primary-600': '79 70 229',
		'--color-primary-700': '67 56 202',
		'--color-primary-800': '55 48 163',
		'--color-primary-900': '49 46 129',
		// secondary | #06b6d4 (cyan)
		'--color-secondary-50': '236 254 255',
		'--color-secondary-100': '207 250 254',
		'--color-secondary-200': '165 243 252',
		'--color-secondary-300': '103 232 249',
		'--color-secondary-400': '34 211 238',
		'--color-secondary-500': '6 182 212',
		'--color-secondary-600': '8 145 178',
		'--color-secondary-700': '14 116 144',
		'--color-secondary-800': '21 94 117',
		'--color-secondary-900': '22 78 99',
		// tertiary | #8b5cf6 (violet)
		'--color-tertiary-50': '245 243 255',
		'--color-tertiary-100': '237 233 254',
		'--color-tertiary-200': '221 214 254',
		'--color-tertiary-300': '196 181 253',
		'--color-tertiary-400': '167 139 250',
		'--color-tertiary-500': '139 92 246',
		'--color-tertiary-600': '124 58 237',
		'--color-tertiary-700': '109 40 217',
		'--color-tertiary-800': '91 33 182',
		'--color-tertiary-900': '76 29 149',
		// success | #10b981 (emerald)
		'--color-success-50': '236 253 245',
		'--color-success-100': '209 250 229',
		'--color-success-200': '167 243 208',
		'--color-success-300': '110 231 183',
		'--color-success-400': '52 211 153',
		'--color-success-500': '16 185 129',
		'--color-success-600': '5 150 105',
		'--color-success-700': '4 120 87',
		'--color-success-800': '6 95 70',
		'--color-success-900': '6 78 59',
		// warning | #f59e0b (amber)
		'--color-warning-50': '255 251 235',
		'--color-warning-100': '254 243 199',
		'--color-warning-200': '253 230 138',
		'--color-warning-300': '252 211 77',
		'--color-warning-400': '251 191 36',
		'--color-warning-500': '245 158 11',
		'--color-warning-600': '217 119 6',
		'--color-warning-700': '180 83 9',
		'--color-warning-800': '146 64 14',
		'--color-warning-900': '120 53 15',
		// error | #f43f5e (rose)
		'--color-error-50': '255 241 242',
		'--color-error-100': '255 228 230',
		'--color-error-200': '254 205 211',
		'--color-error-300': '253 164 175',
		'--color-error-400': '251 113 133',
		'--color-error-500': '244 63 94',
		'--color-error-600': '225 29 72',
		'--color-error-700': '190 18 60',
		'--color-error-800': '159 18 57',
		'--color-error-900': '136 19 55',
		// surface | #64748b (blue-slate)
		'--color-surface-50': '248 250 252',
		'--color-surface-100': '241 245 249',
		'--color-surface-200': '226 232 240',
		'--color-surface-300': '203 213 225',
		'--color-surface-400': '148 163 184',
		'--color-surface-500': '100 116 139',
		'--color-surface-600': '71 85 105',
		'--color-surface-700': '51 65 85',
		'--color-surface-800': '30 41 59',
		'--color-surface-900': '15 23 42'
	}
};
