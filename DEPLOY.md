# Руководство по развертыванию Lottery Stats

Это руководство поможет вам развернуть приложение Lottery Stats (веб-панель и Telegram-бот) на вашем сервере (VPS/VDS).

## Требования

*   **OS:** Ubuntu 20.04/22.04 (рекомендуется) или любой другой Linux.
*   **Python:** Версия 3.11 или выше.
*   **Node.js:** Версия 18 или выше (для сборки фронтенда).

## Шаг 1: Подготовка сервера

1.  Обновите пакеты:
    ```bash
    sudo apt update && sudo apt upgrade -y
    ```

2.  Установите Python 3.11, pip и venv:
    ```bash
    sudo apt install python3.11 python3.11-venv python3-pip -y
    ```

3.  Установите Node.js (через nvm или пакетный менеджер):
    ```bash
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt install -y nodejs
    ```

## Шаг 2: Установка приложения

1.  Создайте папку для проекта и загрузите файлы (распакуйте архив, скачанный с сайта):
    ```bash
    mkdir lottery-stats
    cd lottery-stats
    # Загрузите файлы сюда (например, через SCP или git clone)
    unzip lottery-monitor-*.zip
    ```

2.  Создайте виртуальное окружение Python и активируйте его:
    ```bash
    python3.11 -m venv venv
    source venv/bin/activate
    ```

3.  Установите зависимости Python:
    ```bash
    pip install -r requirements.txt
    ```

4.  Установите зависимости Node.js и соберите фронтенд:
    ```bash
    npm install
    npm run build
    ```
    *После этого шага появится папка `dist` с готовым сайтом.*

## Шаг 3: Настройка

1.  Убедитесь, что сервер доступен по порту 3000.

## Шаг 4: Запуск

Вы можете запустить все одной командой (если используете скрипт start.sh):
```bash
chmod +x start.sh
./start.sh
```

Или запустить вручную:

```bash
python3 server.py
```
*Сайт будет доступен по адресу http://ВАШ_IP:3000*

## Шаг 5: Запуск в фоновом режиме (Production)

Для того чтобы приложение работало постоянно, даже после закрытия консоли, используйте `systemd`.

### 1. Сервис для сайта (`lottery-web.service`)

Создайте файл `/etc/systemd/system/lottery-web.service`:

```ini
[Unit]
Description=Lottery Stats Web Server
After=network.target

[Service]
User=root
WorkingDirectory=/root/lottery-stats
ExecStart=/root/lottery-stats/venv/bin/python server.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```
*Замените `/root/lottery-stats` на ваш путь к папке проекта.*

### 2. Активация сервиса

```bash
sudo systemctl daemon-reload
sudo systemctl enable lottery-web
sudo systemctl start lottery-web
```

## Проверка статуса

```bash
sudo systemctl status lottery-web
```

## Логи

```bash
journalctl -u lottery-web -f
```
