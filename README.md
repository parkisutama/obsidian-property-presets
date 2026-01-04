# Property Presets

A lightweight Obsidian plugin that provides autocomplete for frontmatter properties based on a simple JSON configuration.

## Features

- **Property Buttons**: Click a button (⋮⋮) next to any property in Live Preview or Reading mode to quickly select from preset values
- **Source Mode Autocomplete**: Get type-ahead suggestions when editing YAML frontmatter in source mode
- **Property Type Awareness**: Supports different property types (text, list, multitext, tags) with appropriate behavior
- **Smart Multi-Value Handling**: For list/tag properties, adds values without duplicates; for single-value properties, replaces the value
- **Auto-Reload**: Automatically detects external changes to configuration files and reloads presets
- **Easy Configuration**: Simple JSON files to configure presets and property types

## How It Works

### Visual Property Buttons (Live Preview/Reading Mode)

When viewing notes, the plugin injects a button (⋮⋮) next to each property that has presets configured. Click the button to open a menu with preset options:

- **Single-value properties** (text, number): Click an option to set the property value
- **Multi-value properties** (list, multitext, tags): Click an option to add it to the existing values (prevents duplicates)

The button appears directly in the properties panel using Obsidian's `metadataEditor` API.

### Source Mode Autocomplete

When editing YAML frontmatter in source mode, the plugin provides suggestions as you type property values. After typing `propertyname:` and a space, suggestions will appear automatically.

## Installation

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/parkisutama/obsidian-property-presets/releases)
2. Create a folder `<vault>/.obsidian/plugins/obsidian-property-presets/`
3. Copy the files into that folder
4. Reload Obsidian and enable the plugin in **Settings → Community plugins**

## Configuration

The plugin uses two JSON configuration files stored in your vault's `.obsidian` folder:

### presets.json

Defines preset values for each property. The plugin creates this file with default values on first run:

```json
{
  "status": ["To Do", "In Progress", "Done"],
  "priority": ["High", "Medium", "Low"],
  "tags": ["journal", "project", "note"]
}
```

### types.json

Specifies the type of each property. The plugin creates this file with default values on first run:

```json
{
  "status": "text",
  "priority": "text",
  "tags": "tags"
}
```

Valid types:

- `text` - Single text value (replaces existing value)
- `multitext` - Multiple text values (adds to existing values)
- `list` - List of values (adds to existing values)
- `tags` - Tags (adds to existing values)
- `number` - Numeric value
- `date` - Date value
- `datetime` - Date and time value
- `checkbox` - Boolean value

**Note**: For multi-value types (`list`, `multitext`, `tags`), the plugin adds values to the existing array without creating duplicates. For single-value types (`text`, `number`, etc.), the plugin replaces the existing value.

The plugin automatically detects changes to these files and reloads presets without requiring a manual reload.

## Commands

The plugin adds four commands accessible via the command palette (`Ctrl/Cmd+P`):

1. **Edit presets (JSON)** - Opens a modal to edit your presets configuration
2. **Edit property types (JSON)** - Opens a modal to edit property type definitions
3. **Reload presets from file** - Manually reloads the configuration files
4. **Refresh property icons** - Manually refreshes the property buttons in the current view

## Usage Tips

1. **Start Simple**: Begin with a few common properties like `status`, `priority`, or `tags`
2. **Edit Configuration**: Use the built-in commands to edit presets and types, or edit the JSON files directly in `<vault>/.obsidian/`
3. **Multiple Vaults**: Each vault has its own separate configuration
4. **Auto-Reload**: The plugin automatically detects and reloads configuration changes made externally
5. **Duplicate Prevention**: For multi-value properties, the plugin prevents adding duplicate values

## Behavior by Property Type

- **Single-value properties** (`text`, `number`, `date`, etc.): Clicking a preset **replaces** the current value
- **Multi-value properties** (`list`, `multitext`, `tags`): Clicking a preset **adds** to existing values (no duplicates)

## Mobile Support

This plugin is fully compatible with Obsidian mobile (`isDesktopOnly: false`).

## Development

### Setup

```bash
npm install
```

### Build

```bash
npm run build
```

### Development Mode (Watch)

```bash
npm run dev
```

### Linting

```bash
npm run lint
```

### Testing

For manual testing, copy `main.js`, `manifest.json`, and `styles.css` to:

```
<vault>/.obsidian/plugins/obsidian-property-presets/
```

Then reload Obsidian and enable the plugin in **Settings → Community plugins**.

## Project Structure

```
src/
  main.ts       # Plugin entry point, commands, icon injection
  settings.ts   # Settings interface and tab
```

## Contributing

Issues and pull requests are welcome on [GitHub](https://github.com/parkisutama/obsidian-property-presets).

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Author

[Parkis Utama](https://github.com/parkisutama)

## Funding URL

You can include funding URLs where people who use your plugin can financially support it.

The simple way is to set the `fundingUrl` field to your link in your `manifest.json` file:

```json
{
    "fundingUrl": "https://buymeacoffee.com"
}
```

If you have multiple URLs, you can also do:

```json
{
    "fundingUrl": {
        "Buy Me a Coffee": "https://buymeacoffee.com",
        "GitHub Sponsor": "https://github.com/sponsors",
        "Patreon": "https://www.patreon.com/"
    }
}
```

## API Documentation

See <https://docs.obsidian.md>
