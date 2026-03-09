FROM python:3.12-slim

# System packages — virtual display + VNC + browser + fonts
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    x11vnc \
    novnc \
    websockify \
    chromium \
    chromium-driver \
    fonts-noto \
    fonts-noto-cjk \
    fonts-indic \
    supervisor \
    curl \
    procps \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install playwright && playwright install-deps chromium

# noVNC symlink so websockify serves the right index
RUN ln -sf /usr/share/novnc/vnc.html /usr/share/novnc/index.html

COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY backend/ ./backend/

EXPOSE 8000 6080

COPY docker/start.sh /start.sh
RUN chmod +x /start.sh
CMD ["/start.sh"]
