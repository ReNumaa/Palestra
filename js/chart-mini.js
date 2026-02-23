// Mini chart library for simple visualizations
class SimpleChart {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        const w = rect.width > 0 ? rect.width : (canvas.offsetWidth > 0 ? canvas.offsetWidth : 400);
        const h = 250;
        this.width = canvas.width = Math.round(w * 2);
        this.height = canvas.height = Math.round(h * 2);
        this.ctx.scale(2, 2);
    }

    drawLineChart(data, options = {}) {
        const padding = 40;
        const chartWidth = this.canvas.width / 2 - padding * 2;
        const chartHeight = this.canvas.height / 2 - padding * 2;

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Find max value
        const maxValue = Math.max(...data.values, 1);
        const points = [];

        // Calculate points
        const stepX = chartWidth / (data.labels.length - 1);
        data.values.forEach((value, i) => {
            const x = padding + i * stepX;
            const y = padding + chartHeight - (value / maxValue) * chartHeight;
            points.push({ x, y, value });
        });

        // Draw grid lines
        this.ctx.strokeStyle = '#e0e0e0';
        this.ctx.lineWidth = 1;
        for (let i = 0; i <= 5; i++) {
            const y = padding + (chartHeight / 5) * i;
            this.ctx.beginPath();
            this.ctx.moveTo(padding, y);
            this.ctx.lineTo(padding + chartWidth, y);
            this.ctx.stroke();
        }

        // Draw line
        this.ctx.strokeStyle = options.color || '#e63946';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        points.forEach((point, i) => {
            if (i === 0) {
                this.ctx.moveTo(point.x, point.y);
            } else {
                this.ctx.lineTo(point.x, point.y);
            }
        });
        this.ctx.stroke();

        // Draw points
        this.ctx.fillStyle = options.color || '#e63946';
        points.forEach(point => {
            this.ctx.beginPath();
            this.ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
            this.ctx.fill();
        });

        // Draw labels
        this.ctx.fillStyle = '#666';
        this.ctx.font = '11px sans-serif';
        this.ctx.textAlign = 'center';
        data.labels.forEach((label, i) => {
            const x = padding + i * stepX;
            this.ctx.fillText(label, x, this.canvas.height / 2 - 10);
        });

        // Draw values
        this.ctx.textAlign = 'left';
        for (let i = 0; i <= 5; i++) {
            const value = Math.round((maxValue / 5) * (5 - i));
            const y = padding + (chartHeight / 5) * i;
            this.ctx.fillText(value, 5, y + 4);
        }
    }

    drawPieChart(data, options = {}) {
        const centerX = this.canvas.width / 4;
        const centerY = this.canvas.height / 4;
        const radius = Math.min(centerX, centerY) - 40;

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (radius <= 0) return;

        const colors = options.colors || ['#ff6b6b', '#4ecdc4', '#ffd93d'];
        const total = data.values.reduce((a, b) => a + b, 0);

        if (total === 0) {
            this.ctx.fillStyle = '#ccc';
            this.ctx.font = '14px sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('Nessun dato', centerX, centerY);
            return;
        }

        let currentAngle = -Math.PI / 2;

        data.values.forEach((value, i) => {
            const sliceAngle = (value / total) * Math.PI * 2;

            // Draw slice
            this.ctx.fillStyle = colors[i % colors.length];
            this.ctx.beginPath();
            this.ctx.moveTo(centerX, centerY);
            this.ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
            this.ctx.closePath();
            this.ctx.fill();

            // Draw border
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            currentAngle += sliceAngle;
        });

        // Draw legend
        const legendX = centerX + radius + 30;
        let legendY = centerY - (data.labels.length * 20) / 2;

        this.ctx.textAlign = 'left';
        this.ctx.font = '12px sans-serif';

        data.labels.forEach((label, i) => {
            // Color box
            this.ctx.fillStyle = colors[i % colors.length];
            this.ctx.fillRect(legendX, legendY - 8, 12, 12);

            // Label
            this.ctx.fillStyle = '#333';
            const percentage = total > 0 ? Math.round((data.values[i] / total) * 100) : 0;
            this.ctx.fillText(`${label} (${percentage}%)`, legendX + 18, legendY + 2);

            legendY += 20;
        });
    }
}
