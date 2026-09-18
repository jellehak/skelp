export const CUSTOM_CSS_PRESETS = [
	{
		name: 'Compact chat',
		css: `.chat {
	padding: 18px;
}

.message {
	margin-bottom: 14px;
}

.message-content {
	padding: 12px 14px;
}`
	},
	{
		name: 'Soft bubbles',
		css: `.message.user {
	--message-content-bg: #d7f4e8;
	--message-avatar-bg: #d7f4e8;
	--message-avatar-color: #10231d;
}

.message.assistant {
	--message-content-bg: #15201d;
	--message-content-border-left: 2px solid #8fcfba;
}`
	},
	{
		name: 'Light theme',
		css: `:root {
	--bg: #f7f4ee;
	--bg-secondary: #fffaf2;
	--bg-tertiary: #f1eadf;
	--surface: #ffffff;
	--surface-hover: #f3eee5;
	--border: #d9cec0;
	--text: #25211c;
	--text-muted: #72685d;
	--accent: #2f8f74;
	--accent-dim: #236f5a;
	--user-bg: #d9f1e8;
	--assistant-bg: #ffffff;
	--input-bg: #fffaf2;
}

body {
	background-image: linear-gradient(rgba(217, 206, 192, .38) 1px, transparent 1px), linear-gradient(90deg, rgba(217, 206, 192, .26) 1px, transparent 1px);
}

.header,
.input-area,
.session-rail {
	background: rgba(255, 250, 242, .94);
}

.session-tab.active {
	background: #e4f4ee;
}

.btn-primary {
	color: #ffffff;
}`
	},
	{
		name: 'Large font',
		css: `html,
body {
	font-size: 18px;
}`
	}
];
