import { getAdminStatusCounts } from './demo-store.js';
import { showToast } from './toast.js';

const CHART_COLORS = {
  Pending: '#9a6500',
  Approved: '#18734a',
  Rejected: '#b4232f'
};

function createSvgElement(name, attributes = {}) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

export async function renderAdminChart(container) {
  try {
    const counts = await getAdminStatusCounts();
    const statuses = ['Pending', 'Approved', 'Rejected'];
    const total = statuses.reduce((sum, status) => sum + (counts[status] || 0), 0);
    container.replaceChildren();

    const chart = createSvgElement('svg', {
      class: 'status-chart',
      viewBox: '0 0 220 220',
      role: 'img',
      'aria-labelledby': 'clearance-chart-title clearance-chart-desc'
    });
    const title = createSvgElement('title', { id: 'clearance-chart-title' });
    title.textContent = 'Clearance request status';
    const description = createSvgElement('desc', { id: 'clearance-chart-desc' });
    description.textContent = statuses.map((status) => `${status}: ${counts[status] || 0}`).join(', ');
    chart.append(title, description);

    const radius = 78;
    const circumference = 2 * Math.PI * radius;
    chart.append(createSvgElement('circle', {
      cx: '110', cy: '110', r: String(radius), fill: 'none',
      stroke: '#e8e8ef', 'stroke-width': '24'
    }));

    let offset = 0;
    statuses.forEach((status) => {
      const count = counts[status] || 0;
      if (!total || !count) return;
      const segmentLength = circumference * count / total;
      chart.append(createSvgElement('circle', {
        cx: '110', cy: '110', r: String(radius), fill: 'none',
        stroke: CHART_COLORS[status], 'stroke-width': '24',
        'stroke-dasharray': `${segmentLength} ${circumference - segmentLength}`,
        'stroke-dashoffset': String(-offset),
        transform: 'rotate(-90 110 110)'
      }));
      offset += segmentLength;
    });

    const totalLabel = createSvgElement('text', {
      x: '110', y: '105', 'text-anchor': 'middle', class: 'status-chart-total'
    });
    totalLabel.textContent = String(total);
    const caption = createSvgElement('text', {
      x: '110', y: '127', 'text-anchor': 'middle', class: 'status-chart-caption'
    });
    caption.textContent = 'requests';
    chart.append(totalLabel, caption);

    const legend = document.createElement('ul');
    legend.className = 'status-chart-legend';
    statuses.forEach((status) => {
      const count = counts[status] || 0;
      const percentage = total ? Math.round((count / total) * 100) : 0;
      const item = document.createElement('li');
      const swatch = document.createElement('span');
      swatch.className = 'status-chart-swatch';
      swatch.style.backgroundColor = CHART_COLORS[status];
      swatch.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.textContent = status;
      const value = document.createElement('strong');
      value.textContent = `${count} · ${percentage}%`;
      item.append(swatch, label, value);
      legend.append(item);
    });
    container.append(chart, legend);
  } catch (error) {
    showToast(error.message || 'The clearance chart could not be loaded.', 'error');
  }
}
