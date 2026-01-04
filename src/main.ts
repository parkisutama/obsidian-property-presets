import {
	App,
	Editor,
	EditorPosition,
	EditorSuggest,
	EditorSuggestContext,
	EditorSuggestTriggerInfo,
	Modal,
	Notice,
	Plugin,
	Setting,
	TFile,
	MarkdownView,
	Menu
} from 'obsidian';

// ------------------------------------------------------------------
// INTERFACES
// ------------------------------------------------------------------

interface PresetConfig {
	[key: string]: string[];
}

interface TypesConfig {
	[key: string]: PropertyType;
}

type PropertyType = 'text' | 'multitext' | 'number' | 'checkbox' | 'date' | 'datetime' | 'list' | 'tags';

// ------------------------------------------------------------------
// MAIN PLUGIN CLASS
// ------------------------------------------------------------------

export default class PropertyPresetsPlugin extends Plugin {
	presets: PresetConfig = {};
	types: TypesConfig = {};
	private reloadDebounceTimer: NodeJS.Timeout | null = null;
	private fileWatcherInterval: number | null = null;
	private lastPresetsModified: number = 0;
	private lastTypesModified: number = 0;

	getPresetsPath(): string {
		return `${this.app.vault.configDir}/presets.json`;
	}

	getTypesPath(): string {
		return `${this.app.vault.configDir}/types.json`;
	}

	async onload() {
		await this.loadPresets();
		await this.loadTypes();

		// Initialize last modified times
		await this.updateLastModifiedTimes();

		// Watch for external changes to preset/type files using polling
		// (vault events don't reliably fire for .obsidian/ folder files)
		this.fileWatcherInterval = window.setInterval(async () => {
			await this.checkForFileChanges();
		}, 2000); // Check every 2 seconds

		this.register(() => {
			if (this.fileWatcherInterval !== null) {
				window.clearInterval(this.fileWatcherInterval);
			}
		});

		// Register Editor Suggester (works in Source mode only)
		this.registerEditorSuggest(new PropertyPresetSuggester(this.app, this));

		// Add icons when layout changes or active leaf changes
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				setTimeout(() => this.addPresetIcons(), 100);
			})
		);

		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				setTimeout(() => this.addPresetIcons(), 100);
			})
		);

		// Initial icon injection after slight delay
		this.app.workspace.onLayoutReady(() => {
			setTimeout(() => this.addPresetIcons(), 200);
		});

		// Commands
		this.addCommand({
			id: 'edit-presets',
			name: 'Edit presets (JSON)',
			callback: () => new PresetEditModal(this.app, this).open()
		});

		this.addCommand({
			id: 'edit-types',
			name: 'Edit property types (JSON)',
			callback: () => new TypesEditModal(this.app, this).open()
		});

		this.addCommand({
			id: 'reload-presets',
			name: 'Reload presets from file',
			callback: async () => {
				await this.loadPresets();
				await this.loadTypes();
				new Notice('Property presets reloaded.');
			}
		});

		this.addCommand({
			id: 'refresh-icons',
			name: 'Refresh property icons',
			callback: () => {
				this.addPresetIcons();
				new Notice('Property icons refreshed.');
			}
		});
	}

	addPresetIcons() {
		const leaves = this.app.workspace.getLeavesOfType("markdown");

		leaves.forEach((leaf) => {
			const view = leaf.view as any;
			if (!view.metadataEditor || !view.file) return;

			const metadataEditor = view.metadataEditor;
			if (!metadataEditor.rendered || !Array.isArray(metadataEditor.rendered)) {
				return;
			}

			metadataEditor.rendered.forEach((item: any) => {
				const propertyName = item.entry?.key;
				if (!propertyName || !this.presets[propertyName]) {
					return;
				}

				// Remove existing buttons
				// Remove existing buttons
				const existingButtons = item.keyEl?.findAll('.property-preset-btn-container');
				if (existingButtons) {
					existingButtons.forEach((btn: HTMLElement) => btn.remove());
				}

				if (!item.keyEl) return;

				// Create button container inside the property key
				const btnContainer = item.keyEl.createDiv({ cls: 'property-preset-btn-container' });
				// Create button
				const btn = btnContainer.createEl('button', {
					cls: 'property-preset-btn'
				});
				btn.setAttribute('aria-label', 'Choose from presets');
				btn.textContent = '⋮⋮';

				btn.onclick = async (event: MouseEvent) => {
					event.stopPropagation();
					const propertyType = this.getPropertyType(propertyName);
					const allPresetOptions = this.presets[propertyName] || [];

					if (allPresetOptions.length === 0) {
						new Notice('No presets available for this property.');
						return;
					}

					const allowMultiple = ['list', 'multitext', 'tags'].includes(propertyType);
					let availableOptions = [...allPresetOptions];

					// For multi-value properties, filter out existing values
					if (allowMultiple) {
						try {
							const fileContent = await this.app.vault.read(view.file);
							const frontmatterMatch = fileContent.match(/^---\n([\s\S]*?)\n---/);

							if (frontmatterMatch && frontmatterMatch[1]) {
								const yaml = frontmatterMatch[1];
								const propertyMatch = yaml.match(new RegExp(`^${propertyName}:\\s*(.*)$`, 'm'));

								if (propertyMatch && propertyMatch[1]) {
									const valueStr = propertyMatch[1].trim();
									let existingValues: string[] = [];

									// Check if it's an array (starts with [)
									if (valueStr.startsWith('[')) {
										try {
											const parsed = JSON.parse(valueStr);
											if (Array.isArray(parsed)) {
												existingValues = parsed.map(v => String(v));
											}
										} catch {
											// Not valid JSON, might be YAML array
										}
									} else if (valueStr) {
										// Single value
										existingValues = [valueStr];
									}

									// Filter out existing values
									availableOptions = allPresetOptions.filter(opt => !existingValues.includes(opt));
								}
							}
						} catch (err) {
							console.error('Error parsing frontmatter:', err);
						}

						if (availableOptions.length === 0) {
							new Notice(`All preset values already exist in ${propertyName}`);
							return;
						}
					}

					const menu = new Menu();

					if (allowMultiple) {
						// For list/tags properties, ADD value instead of replacing
						allPresetOptions.forEach(option => {
							menu.addItem(item => {
								item.setTitle(option)
									.onClick(async () => {
										try {
											await this.app.fileManager.processFrontMatter(view.file, (frontmatter: Record<string, unknown>) => {
												const currentValue = frontmatter[propertyName];
												let newValue: string[];

												// Handle existing values - ALWAYS create/append to array
												if (Array.isArray(currentValue)) {
													// Check for duplicate before adding
													const stringArray = currentValue.map(v => String(v));
													if (!stringArray.includes(option)) {
														newValue = [...currentValue, option];
													} else {
														new Notice(`${option} already exists in ${propertyName}`);
														return;
													}
												} else if (currentValue && currentValue !== '') {
													// Convert existing single value to array
													const existingStr = String(currentValue);
													if (existingStr === option) {
														new Notice(`${option} already exists in ${propertyName}`);
														return;
													}
													newValue = [existingStr, option];
												} else {
													// Empty or undefined - create new array
													newValue = [option];
												}

												frontmatter[propertyName] = newValue;
											});
											new Notice(`Added ${option} to ${propertyName}`);
										} catch (err) {
											console.error('Failed to update property:', err);
											new Notice('Failed to update property.');
										}
									});
							});
						});
					} else {
						// For single-select properties, SET value (replace)
						allPresetOptions.forEach(option => {
							menu.addItem(item => {
								item.setTitle(option)
									.onClick(async () => {
										try {
											await this.app.fileManager.processFrontMatter(view.file, (frontmatter: Record<string, unknown>) => {
												frontmatter[propertyName] = option;
											});
											new Notice(`Set ${propertyName} to: ${option}`);
										} catch (err) {
											console.error('Failed to update property:', err);
											new Notice('Failed to update property.');
										}
									});
							});
						});
					}

					menu.showAtMouseEvent(event);
				};
			});
		});
	}

	async loadPresets() {
		const adapter = this.app.vault.adapter;
		const presetsPath = this.getPresetsPath();
		try {
			if (await adapter.exists(presetsPath)) {
				const content = await adapter.read(presetsPath);
				this.presets = JSON.parse(content) as PresetConfig;
			} else {
				const defaultPresets: PresetConfig = {
					"status": ["To Do", "In Progress", "Done"],
					"priority": ["High", "Medium", "Low"],
					"tags": ["journal", "project", "note"]
				};
				await adapter.write(presetsPath, JSON.stringify(defaultPresets, null, 2));
				this.presets = defaultPresets;
			}
		} catch (err) {
			console.error("Failed to load presets:", err);
			new Notice("Error loading presets. Check console.");
		}
	}

	async loadTypes() {
		const adapter = this.app.vault.adapter;
		const typesPath = this.getTypesPath();
		try {
			if (await adapter.exists(typesPath)) {
				const content = await adapter.read(typesPath);
				const parsed = JSON.parse(content);

				// Handle both flat structure and nested {types: {...}} structure
				if (parsed.types && typeof parsed.types === 'object') {
					this.types = parsed.types as TypesConfig;
				} else {
					this.types = parsed as TypesConfig;
				}
			} else {
				const defaultTypes: TypesConfig = {
					"status": "text",
					"priority": "text",
					"tags": "tags"
				};
				await adapter.write(typesPath, JSON.stringify(defaultTypes, null, 2));
				this.types = defaultTypes;
			}
		} catch (err) {
			console.error("Failed to load types:", err);
			new Notice("Error loading types. Check console.");
		}
	}

	async savePresets(newPresets: PresetConfig) {
		this.presets = newPresets;
		const adapter = this.app.vault.adapter;
		const presetsPath = this.getPresetsPath();
		await adapter.write(presetsPath, JSON.stringify(newPresets, null, 2));
	}

	async saveTypes(newTypes: TypesConfig) {
		this.types = newTypes;
		const adapter = this.app.vault.adapter;
		const typesPath = this.getTypesPath();
		await adapter.write(typesPath, JSON.stringify(newTypes, null, 2));
	}

	/**
	 * Debounced reload to prevent excessive reloads when files change externally
	 */
	private debouncedReload() {
		if (this.reloadDebounceTimer) {
			clearTimeout(this.reloadDebounceTimer);
		}
		this.reloadDebounceTimer = setTimeout(async () => {
			await this.loadPresets();
			await this.loadTypes();
			this.addPresetIcons();
			new Notice('Property presets auto-reloaded from file changes');
			this.reloadDebounceTimer = null;
		}, 500);
	}

	/**
	 * Update stored modification times for config files
	 */
	private async updateLastModifiedTimes() {
		const adapter = this.app.vault.adapter;
		try {
			const presetsStat = await adapter.stat(this.getPresetsPath());
			const typesStat = await adapter.stat(this.getTypesPath());
			this.lastPresetsModified = presetsStat?.mtime || 0;
			this.lastTypesModified = typesStat?.mtime || 0;
		} catch (err) {
			// Files might not exist yet
		}
	}

	/**
	 * Check if config files have been modified and reload if needed
	 */
	private async checkForFileChanges() {
		const adapter = this.app.vault.adapter;
		try {
			const presetsStat = await adapter.stat(this.getPresetsPath());
			const typesStat = await adapter.stat(this.getTypesPath());

			const presetsModified = presetsStat?.mtime || 0;
			const typesModified = typesStat?.mtime || 0;

			if (presetsModified > this.lastPresetsModified ||
				typesModified > this.lastTypesModified) {
				this.lastPresetsModified = presetsModified;
				this.lastTypesModified = typesModified;
				this.debouncedReload();
			}
		} catch (err) {
			// Files might not exist or be inaccessible
		}
	}

	getPropertyType(propertyName: string): PropertyType {
		return this.types[propertyName] || 'text';
	}
}

// ------------------------------------------------------------------
// PROPERTY PRESET SUGGESTER (Source Mode)
// ------------------------------------------------------------------

class PropertyPresetSuggester extends EditorSuggest<string> {
	plugin: PropertyPresetsPlugin;

	constructor(app: App, plugin: PropertyPresetsPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo | null {
		const line = editor.getLine(cursor.line);
		const preKey = line.substring(0, cursor.ch);

		// Match property key at start of line in frontmatter
		const match = preKey.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):(\s*)$/);
		if (!match) return null;

		const propertyName = match[1];
		if (!propertyName || !this.plugin.presets[propertyName]) return null;

		return {
			start: { line: cursor.line, ch: match[0].length },
			end: cursor,
			query: ""
		};
	}
	getExistingPropertyValues(editor: Editor, propertyName: string): string[] {
		const content = editor.getValue();
		const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

		if (!frontmatterMatch || !frontmatterMatch[1]) return [];

		const yaml = frontmatterMatch[1];
		const propertyMatch = yaml.match(new RegExp(`^${propertyName}:\\s*(.*)$`, 'm'));

		if (!propertyMatch || !propertyMatch[1]) return [];

		const valueStr = propertyMatch[1].trim();
		const existingValues: string[] = [];

		// Check if it's an array (starts with [)
		if (valueStr.startsWith('[')) {
			try {
				const parsed = JSON.parse(valueStr);
				if (Array.isArray(parsed)) {
					return parsed.map(v => String(v));
				}
			} catch {
				// Not valid JSON, continue to check YAML-style arrays
			}
		}

		// Check for YAML-style arrays (multiline with -)
		const lines = yaml.split('\n');
		let inArray = false;
		for (const line of lines) {
			if (line.match(new RegExp(`^${propertyName}:\\s*$`))) {
				inArray = true;
				continue;
			}
			if (inArray) {
				const arrayItemMatch = line.match(/^\s*-\s+(.+)$/);
				if (arrayItemMatch && arrayItemMatch[1]) {
					existingValues.push(arrayItemMatch[1].trim());
				} else if (!line.match(/^\s*$/)) {
					// Non-array line, stop
					break;
				}
			}
		}

		if (existingValues.length > 0) return existingValues;

		// Single value
		if (valueStr && !valueStr.startsWith('[')) {
			return [valueStr];
		}

		return [];
	}
	getSuggestions(context: EditorSuggestContext): string[] {
		const line = context.editor.getLine(context.start.line);
		const match = line.substring(0, context.start.ch).match(/^([a-zA-Z_][a-zA-Z0-9_-]*):/)
		const propertyName = match ? match[1] : null;
		if (!propertyName) return [];

		// Return all preset options - duplicate prevention happens at selection time
		return this.plugin.presets[propertyName] || [];
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.createDiv({ text: value, cls: 'suggestion-item' });
	}

	selectSuggestion(value: string, evt: MouseEvent | KeyboardEvent): void {
		const cursor = this.context!.start;
		const editor = this.context!.editor;
		const line = editor.getLine(cursor.line);
		const propertyName = line.substring(0, cursor.ch).match(/^([a-zA-Z_][a-zA-Z0-9_-]*):/)![1];

		if (!propertyName) return;

		const propertyType = this.plugin.getPropertyType(propertyName);
		const existingValues = this.getExistingPropertyValues(editor, propertyName);

		// For multitext, list, and tags - ADD to array (with duplicate check)
		if (['multitext', 'list', 'tags'].includes(propertyType)) {
			// Check for duplicate
			if (existingValues.includes(value)) {
				new Notice(`${value} already exists in ${propertyName}`);
				this.close();
				return;
			}

			// Get the entire line content
			const currentLineContent = line.substring(cursor.ch);

			// If there's already content on this line
			if (currentLineContent.trim()) {
				// Parse existing content and add to it
				let newContent: string;
				if (existingValues.length > 0) {
					// Create array with existing values + new value
					const allValues = [...existingValues, value];
					newContent = JSON.stringify(allValues);
				} else {
					// First value, but treat as array
					newContent = JSON.stringify([value]);
				}

				// Replace from property name to end of line
				editor.replaceRange(
					newContent,
					{ line: cursor.line, ch: propertyName.length + 1 },
					{ line: cursor.line, ch: line.length }
				);
			} else {
				// Empty line after property name, add as array
				const allValues = existingValues.length > 0 ? [...existingValues, value] : [value];
				editor.replaceRange(' ' + JSON.stringify(allValues), cursor, this.context!.end);
			}

			new Notice(`Added ${value} to ${propertyName}`);
		} else {
			// For text and other single-value types - REPLACE
			editor.replaceRange(value, cursor, this.context!.end);

			// Move cursor to end of inserted value
			const newCursor = { line: cursor.line, ch: cursor.ch + value.length };
			editor.setCursor(newCursor);
		}
	}
}

// ------------------------------------------------------------------
// PRESET EDIT MODAL
// ------------------------------------------------------------------

class PresetEditModal extends Modal {
	plugin: PropertyPresetsPlugin;
	tempValue: string;

	constructor(app: App, plugin: PropertyPresetsPlugin) {
		super(app);
		this.plugin = plugin;
		this.tempValue = JSON.stringify(plugin.presets, null, 2);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "Edit property presets" });
		contentEl.createEl("p", { text: "Saved to: " + this.plugin.getPresetsPath() });

		new Setting(contentEl)
			.addTextArea(text => {
				text.setValue(this.tempValue)
					.onChange(val => this.tempValue = val);
				text.inputEl.setAttr("rows", 15);
				text.inputEl.setAttr("style", "width: 100%; font-family: monospace;");
			});

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText("Save and close")
				.setCta()
				.onClick(async () => {
					try {
						const parsed = JSON.parse(this.tempValue) as PresetConfig;
						await this.plugin.savePresets(parsed);
						// Auto-refresh icons so changes take effect immediately
						this.plugin.addPresetIcons();
						new Notice("Property presets saved!");
						this.close();
					} catch {
						new Notice("Invalid JSON.");
					}
				}));
	}

	onClose() {
		this.contentEl.empty();
	}
}

// ------------------------------------------------------------------
// TYPES EDIT MODAL
// ------------------------------------------------------------------

class TypesEditModal extends Modal {
	plugin: PropertyPresetsPlugin;
	tempValue: string;

	constructor(app: App, plugin: PropertyPresetsPlugin) {
		super(app);
		this.plugin = plugin;
		this.tempValue = JSON.stringify(plugin.types, null, 2);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "Edit property types" });
		contentEl.createEl("p", { text: "Saved to: " + this.plugin.getTypesPath() });
		contentEl.createEl("p", {
			text: "Valid types: text, multitext, number, checkbox, date, datetime, list, tags"
		});

		new Setting(contentEl)
			.addTextArea(text => {
				text.setValue(this.tempValue)
					.onChange(val => this.tempValue = val);
				text.inputEl.setAttr("rows", 15);
				text.inputEl.setAttr("style", "width: 100%; font-family: monospace;");
			});

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText("Save and close")
				.setCta()
				.onClick(async () => {
					try {
						const parsed = JSON.parse(this.tempValue) as TypesConfig;
						await this.plugin.saveTypes(parsed);
						// Auto-refresh icons so changes take effect immediately
						this.plugin.addPresetIcons();
						new Notice("Property types saved!");
						this.close();
					} catch {
						new Notice("Invalid JSON.");
					}
				}));
	}

	onClose() {
		this.contentEl.empty();
	}
}
