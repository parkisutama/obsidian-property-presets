import { App, PluginSettingTab, Setting } from "obsidian";
import PropertyPresetsPlugin from "./main";

export interface PropertyPresetsSettings {
	mySetting: string;
}

export const DEFAULT_SETTINGS: PropertyPresetsSettings = {
	mySetting: 'default'
}

export class PropertyPresetsSettingTab extends PluginSettingTab {
	plugin: PropertyPresetsPlugin;

	constructor(app: App, plugin: PropertyPresetsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Settings #1')
			.setDesc('It\'s a secret')
			.addText(text => {
				text.setPlaceholder('Enter your secret')
					.setValue('')
					.onChange(async (value: string) => {
						console.debug('Setting changed:', value);
					});
			});
	}
}
