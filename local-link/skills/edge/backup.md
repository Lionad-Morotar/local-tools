2.1 prepare env

```bash
mkdir -p "$HOME/.config/edge/Default"
cp -R "~/Library/Application Support/Microsoft Edge/Default" "$HOME/.config/edge/Default"
```

2.2 open a edge instance

```bash
nohup /Applications/Microsoft\ Edge.app/Contents/MacOS/Microsoft\ Edge \
    --remote-allow-origins=http://localhost:9333 \
    --remote-debugging-port=9333 \
    --user-data-dir="$HOME/.config/edge"
```