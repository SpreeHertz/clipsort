# ClipSort
![show ui](https://github.com/SpreeHertz/clipsort/blob/main/resources/v2.png?raw=true)

This Electron app helps sort gaming clips quickly and effectively.

## Features

- Rename and delete on-the-fly
- Obsidian-like graph view for viewing clips by friend names
- Get clips recursively through folders and queue them
- Skip to last `n` seconds if preferred 
- Clean UI

## Known bugs & performance concerns
1. On fullscreen, `.rename-field` and `buttons-group` are positioned weirdly
2. Renaming toggles graph view
3. High INP during normal usage

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```
