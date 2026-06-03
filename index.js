// Global Data Store
let dashboardData = null;
let currentTab = 'owned'; // 'owned' or 'watched'
let currentOwnedFilter = 'all'; // 'all', 'kr', or 'us'
let ownedChartInstance = null; // Chart.js instance for owned assets ratio


// Initialize dashboard on page load
document.addEventListener('DOMContentLoaded', () => {
  initMobileView();
  fetchDashboardData();
});

// Setup mobile tab view helper
function initMobileView() {
  const isMobile = window.innerWidth <= 820;
  if (isMobile) {
    document.body.className = `tab-${currentTab}-active`;
  }
}

// Switch tabs on mobile layout
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  
  // Set body class for CSS to handle visibility
  document.body.className = `tab-${tab}-active`;
}

// Fetch data from local data.json
async function fetchDashboardData() {
  try {
    // Fetch data.json which is automatically written by the GitHub Action
    const response = await fetch('./data.json');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    dashboardData = await response.json();
    renderDashboard();
  } catch (error) {
    console.error('Failed to load portfolio data:', error);
    showErrorState(error.message);
  }
}

// Render entire dashboard with loaded data
function renderDashboard() {
  if (!dashboardData) return;
  
  // 1. Render Last Update time
  const timeContainer = document.querySelector('#update-time-container span');
  if (timeContainer && dashboardData.updated_at) {
    timeContainer.textContent = `업데이트: ${dashboardData.updated_at}`;
  }

  // 2. Render Summary Panel
  renderSummary();

  // 2.5. Render Global Macro & Sector Insights
  renderMacroInsight(dashboardData.macro_insight);

  // 3. Render Owned Stock cards
  renderOwnedStocks(dashboardData.owned_stocks || []);

  // 4. Render Watched Stock cards
  renderWatchedStocks(dashboardData.watched_stocks || []);
}

// Render top-level summary cards
function renderSummary() {
  const summarySection = document.getElementById('summary-section');
  if (!summarySection) return;
  
  const summary = dashboardData.summary;
  if (!summary) return;

  const totalBuy = summary.total_buy_combined_krw;
  const totalEval = summary.total_eval_combined_krw;
  const totalProfitPct = summary.total_profit_combined_pct;
  const krwRate = summary.krw_rate;

  const isUp = totalProfitPct >= 0;
  const profitColorClass = isUp ? 'change-up' : 'change-down';
  const profitIcon = isUp ? 'fa-circle-chevron-up' : 'fa-circle-chevron-down';
  const profitArrow = isUp ? '🔺' : '🔻';

  summarySection.innerHTML = `
    <!-- Card 1: Total Buy -->
    <div class="summary-card card-buy">
      <div class="card-label">
        <span>총 매수금액</span>
        <i class="fa-solid fa-receipt"></i>
      </div>
      <div class="card-value">${formatKRW(totalBuy)}</div>
      <div class="card-change" style="color: var(--text-muted)">원화 합산 기준</div>
    </div>

    <!-- Card 2: Total Evaluation -->
    <div class="summary-card card-eval">
      <div class="card-label">
        <span>총 평가금액</span>
        <i class="fa-solid fa-wallet"></i>
      </div>
      <div class="card-value">${formatKRW(totalEval)}</div>
      <div class="card-change" style="color: var(--text-muted)">실시간 종가 환산</div>
    </div>

    <!-- Card 3: Total Profit/Loss -->
    <div class="summary-card card-profit">
      <div class="card-label">
        <span>종합 예상수익률</span>
        <i class="fa-solid fa-chart-line"></i>
      </div>
      <div class="card-value ${profitColorClass}">${totalProfitPct.toFixed(2)}%</div>
      <div class="card-change ${profitColorClass}">
        <i class="fa-solid ${profitIcon}"></i>
        <span>${profitArrow} ${formatKRW(Math.abs(totalEval - totalBuy))}</span>
      </div>
    </div>

    <!-- Card 4: Exchange Rate -->
    <div class="summary-card card-rate">
      <div class="card-label">
        <span>원/달러 환율</span>
        <i class="fa-solid fa-dollar-sign"></i>
      </div>
      <div class="card-value">${krwRate.toFixed(2)} 원</div>
      <div class="card-change" style="color: var(--text-muted)">yfinance 실시간 조회</div>
    </div>
  `;
}

// Render Owned Stocks
function renderOwnedStocks(stocks) {
  const container = document.getElementById('owned-stock-list');
  const countBadge = document.getElementById('owned-count');
  const visualPanel = document.getElementById('owned-visual-panel');
  const visualMetrics = document.getElementById('owned-visual-metrics');
  
  if (!container) return;

  // 1. Filter stocks based on currentOwnedFilter
  const filteredStocks = stocks.filter(stock => {
    if (currentOwnedFilter === 'kr') return !stock.is_usd;
    if (currentOwnedFilter === 'us') return stock.is_usd;
    return true;
  });

  countBadge.textContent = filteredStocks.length;

  if (filteredStocks.length === 0) {
    container.innerHTML = `
      <div class="loading-spinner-container">
        <i class="fa-solid fa-circle-exclamation" style="font-size: 2rem; color: var(--text-muted)"></i>
        <p>선택하신 시장의 보유중인 주식이 없습니다.</p>
      </div>
    `;
    if (visualPanel) visualPanel.style.display = 'none';
    if (ownedChartInstance) {
      ownedChartInstance.destroy();
      ownedChartInstance = null;
    }
    return;
  }

  // 2. Calculate dynamic summary metrics (원화 환산 기준)
  const krwRate = (dashboardData && dashboardData.summary) ? dashboardData.summary.krw_rate : 1350;
  let totalBuyKrw = 0;
  let totalEvalKrw = 0;

  filteredStocks.forEach(stock => {
    let buyKrw = 0;
    let evalKrw = 0;

    if (stock.is_usd) {
      const purchasePriceKrw = stock.buy_price_krw || (stock.buy_price * (stock.purchase_rate || krwRate));
      buyKrw = purchasePriceKrw * stock.qty;
      evalKrw = stock.current_price * stock.qty * krwRate;
    } else {
      buyKrw = stock.buy_price * stock.qty;
      evalKrw = stock.current_price * stock.qty;
    }

    totalBuyKrw += buyKrw;
    totalEvalKrw += evalKrw;
  });

  let profitPct = 0;
  if (totalBuyKrw > 0) {
    profitPct = ((totalEvalKrw - totalBuyKrw) / totalBuyKrw) * 100;
  }

  // 3. Render summary metrics UI
  if (visualPanel && visualMetrics) {
    visualPanel.style.display = 'grid';
    const isProfitUp = profitPct >= 0;
    const profitClass = isProfitUp ? 'profit-up' : 'profit-down';
    const profitSign = isProfitUp ? '+' : '';

    visualMetrics.innerHTML = `
      <div class="visual-metric-row">
        <span class="visual-metric-label">총 매수금액</span>
        <span class="visual-metric-value">${formatKRW(totalBuyKrw)}</span>
      </div>
      <div class="visual-metric-row">
        <span class="visual-metric-label">총 평가금액</span>
        <span class="visual-metric-value">${formatKRW(totalEvalKrw)}</span>
      </div>
      <div class="visual-metric-row">
        <span class="visual-metric-label">선택 그룹 수익률</span>
        <span class="visual-metric-value ${profitClass}">${profitSign}${profitPct.toFixed(2)}%</span>
      </div>
    `;
  }

  // 4. Render Donut Chart using Chart.js
  renderAllocationChart(filteredStocks, totalEvalKrw, krwRate);

  // 5. Render individual stock cards
  container.innerHTML = filteredStocks.map(stock => {
    const isUp = stock.change_pct >= 0;
    const changeColorClass = isUp ? 'change-up' : 'change-down';
    const changeArrow = isUp ? '+' : '';
    const currency = stock.is_usd ? '$' : '원';
    
    // Profit metrics
    const isProfitUp = stock.profit_pct >= 0;
    const profitColorClass = isProfitUp ? 'change-up profit-glowing' : 'change-down loss-glowing';
    const profitArrow = isProfitUp ? '+' : '';

    const priceFormatted = stock.is_usd ? stock.current_price.toFixed(2) : Math.round(stock.current_price).toLocaleString();
    const buyFormatted = stock.is_usd ? stock.buy_price.toFixed(2) : Math.round(stock.buy_price).toLocaleString();

    let buyKrwHtml = '';
    if (stock.is_usd && stock.buy_price_krw) {
      buyKrwHtml = `<span style="font-size: 0.65rem; color: var(--text-muted)">(${Math.round(stock.buy_price_krw).toLocaleString()}원)</span>`;
    }

    let fxDetailsHtml = '';
    if (stock.is_usd && stock.purchase_rate) {
      const isFxUp = stock.fx_profit_krw >= 0;
      const fxColorClass = isFxUp ? 'change-up' : 'change-down';
      const fxArrow = isFxUp ? '+' : '';
      
      const isStockProfitUp = stock.stock_profit_krw >= 0;
      const stockProfitColorClass = isStockProfitUp ? 'change-up' : 'change-down';
      const stockProfitArrow = isStockProfitUp ? '+' : '';

      const isTotKrwUp = stock.total_profit_krw >= 0;
      const totKrwColorClass = isTotKrwUp ? 'change-up profit-glowing' : 'change-down loss-glowing';
      const totKrwArrow = isTotKrwUp ? '+' : '';

      fxDetailsHtml = `
        <div class="fx-details-panel">
          <div class="fx-details-row">
            <span>평균 매입환율: <strong>${stock.purchase_rate.toFixed(1)} 원</strong></span>
            <span>원화 총손익: <strong class="${totKrwColorClass}">${totKrwArrow}${stock.total_profit_krw_pct.toFixed(2)}% (${Math.round(stock.total_profit_krw).toLocaleString()}원)</strong></span>
          </div>
          <div class="fx-details-row sub-row">
            <span>└─ 환차손익: <strong class="${fxColorClass}">${fxArrow}${Math.round(stock.fx_profit_krw).toLocaleString()}원</strong></span>
            <span>주가평가손익: <strong class="${stockProfitColorClass}">${stockProfitArrow}${Math.round(stock.stock_profit_krw).toLocaleString()}원</strong></span>
          </div>
        </div>
      `;
    }

    return `
      <div class="stock-card" data-name="${stock.name}" data-ticker="${stock.ticker}">
        <div class="stock-card-top">
          <div class="stock-info">
            <div class="stock-name-row">
              <span class="stock-name">${stock.name}</span>
              <span class="stock-ticker">${stock.ticker}</span>
            </div>
          </div>
          <div class="stock-price-block">
            <div class="stock-price">${priceFormatted} <span style="font-size: 0.8rem">${currency}</span></div>
            <div class="stock-change ${changeColorClass}">${changeArrow}${stock.change_pct.toFixed(2)}%</div>
          </div>
        </div>

        <!-- Portfolio Details Grid -->
        <div class="portfolio-details">
          <div class="detail-item">
            <span class="detail-label">보유 수량</span>
            <span class="detail-val">${stock.qty}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">매수 평단가</span>
            <span class="detail-val">${buyFormatted}${currency} ${buyKrwHtml}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">${stock.is_usd ? 'USD 기준수익률' : '원화 기준수익률'}</span>
            <span class="detail-val ${profitColorClass}">${profitArrow}${stock.profit_pct.toFixed(2)}%</span>
          </div>
        </div>

        <!-- FX details for USD stocks -->
        ${fxDetailsHtml}

        <!-- News snippet -->
        ${renderNewsHtml(stock)}
      </div>
    `;
  }).join('');
}

// Filter owned stocks by all, kr, us
function changeOwnedFilter(filter) {
  currentOwnedFilter = filter;
  
  // Update button active state
  document.querySelectorAll('.owned-filter-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  const activeBtn = document.getElementById(`owned-filter-${filter}`);
  if (activeBtn) activeBtn.classList.add('active');
  
  // Re-render using stored dashboard data
  if (dashboardData && dashboardData.owned_stocks) {
    renderOwnedStocks(dashboardData.owned_stocks);
  }
}

// Render asset allocation chart using Chart.js
function renderAllocationChart(stocks, totalEvalKrw, krwRate) {
  const canvas = document.getElementById('owned-assets-chart');
  if (!canvas) return;

  const chartData = stocks.map(stock => {
    const evalKrw = stock.is_usd 
      ? stock.current_price * stock.qty * krwRate 
      : stock.current_price * stock.qty;
    return {
      name: stock.name,
      value: Math.max(0, evalKrw)
    };
  }).filter(item => item.value > 0);

  // Sort by asset valuation descending
  chartData.sort((a, b) => b.value - a.value);

  const labels = chartData.map(item => item.name);
  const data = chartData.map(item => item.value);

  // Premium, harmonious color palette
  const backgroundColors = [
    'rgba(99, 102, 241, 0.85)',   // Indigo
    'rgba(139, 92, 246, 0.85)',   // Violet
    'rgba(16, 185, 129, 0.85)',   // Emerald
    'rgba(245, 158, 11, 0.85)',   // Amber
    'rgba(239, 68, 68, 0.85)',    // Ruby
    'rgba(6, 182, 212, 0.85)',    // Cyan
    'rgba(236, 72, 153, 0.85)',   // Pink
    'rgba(100, 116, 139, 0.85)'   // Slate
  ];

  const ctx = canvas.getContext('2d');
  
  if (ownedChartInstance) {
    ownedChartInstance.destroy();
  }

  // Handle case where totalEvalKrw is 0
  if (totalEvalKrw <= 0 || data.length === 0) {
    return;
  }

  ownedChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: backgroundColors.slice(0, labels.length),
        borderWidth: 1,
        borderColor: 'rgba(15, 22, 42, 0.8)'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.parsed || 0;
              const percentage = ((value / totalEvalKrw) * 100).toFixed(1);
              return ` ${label}: ${Math.round(value).toLocaleString()}원 (${percentage}%)`;
            }
          }
        }
      },
      cutout: '65%'
    }
  });
}


// Render Watched Stocks
function renderWatchedStocks(stocks) {
  const container = document.getElementById('watched-stock-list');
  const countBadge = document.getElementById('watched-count');
  
  if (!container) return;
  countBadge.textContent = stocks.length;

  if (stocks.length === 0) {
    container.innerHTML = `
      <div class="loading-spinner-container">
        <i class="fa-solid fa-circle-exclamation" style="font-size: 2rem; color: var(--text-muted)"></i>
        <p>관심 목록에 등록된 종목이 없습니다.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = stocks.map(stock => {
    const isUp = stock.change_pct >= 0;
    const changeColorClass = isUp ? 'change-up' : 'change-down';
    const changeArrow = isUp ? '+' : '';
    const currency = stock.is_usd ? '$' : '원';
    const priceFormatted = stock.is_usd ? stock.current_price.toFixed(2) : Math.round(stock.current_price).toLocaleString();

    return `
      <div class="stock-card" data-name="${stock.name}" data-ticker="${stock.ticker}">
        <div class="stock-card-top">
          <div class="stock-info">
            <div class="stock-name-row">
              <span class="stock-name">${stock.name}</span>
              <span class="stock-ticker">${stock.ticker}</span>
            </div>
          </div>
          <div class="stock-price-block">
            <div class="stock-price">${priceFormatted} <span style="font-size: 0.8rem">${currency}</span></div>
            <div class="stock-change ${changeColorClass}">${changeArrow}${stock.change_pct.toFixed(2)}%</div>
          </div>
        </div>

        <!-- News snippet -->
        ${renderNewsHtml(stock)}
      </div>
    `;
  }).join('');
}

// Helper to render news block inside stock card
function renderNewsHtml(stock) {
  if (!stock.news_summary || stock.news_summary.includes("중요 뉴스 없음") || stock.news_summary.includes("수집 실패")) {
    return `
      <div class="stock-news" style="opacity: 0.6">
        <div class="news-header">
          <i class="fa-regular fa-newspaper"></i>
          <span>AI 뉴스 요약</span>
        </div>
        <div class="news-body" style="font-size: 0.8rem; font-style: italic">최근 24시간 동안 보도된 뉴스가 없습니다.</div>
      </div>
    `;
  }
  
  const linkHtml = stock.news_url ? `<a href="${stock.news_url}" target="_blank" class="news-link"><i class="fa-solid fa-arrow-up-right-from-square"></i> 뉴스 원문 보기</a>` : '';

  return `
    <div class="stock-news">
      <div class="news-header">
        <i class="fa-solid fa-bolt"></i>
        <span>AI 뉴스 브리핑</span>
      </div>
      <div class="news-body">${stock.news_summary}</div>
      ${linkHtml}
    </div>
  `;
}

// Helper to format KRW value
function formatKRW(val) {
  return `${Math.round(val).toLocaleString()} 원`;
}

// Search and Filter stock list
function filterStocks() {
  const query = document.getElementById('stock-search').value.toLowerCase().trim();
  const cards = document.querySelectorAll('.stock-card');

  cards.forEach(card => {
    const name = card.getAttribute('data-name').toLowerCase();
    const ticker = card.getAttribute('data-ticker').toLowerCase();
    
    if (name.includes(query) || ticker.includes(query)) {
      card.style.display = 'flex';
    } else {
      card.style.display = 'none';
    }
  });
}

// Error screen state renderer
function showErrorState(message) {
  const appContainer = document.querySelector('.app-container');
  if (appContainer) {
    appContainer.innerHTML = `
      <div class="loading-spinner-container" style="min-height: 80vh">
        <i class="fa-solid fa-triangle-exclamation" style="font-size: 4rem; color: var(--color-ruby)"></i>
        <h2 style="font-family: var(--font-header)">자산 데이터 로드 실패</h2>
        <p style="text-align: center; max-width: 400px; color: var(--text-secondary)">
          저장소 내 <code>data.json</code> 파일을 정상적으로 가져올 수 없습니다. 오전 8시 워크플로우를 먼저 실행해 주세요. <br><br>
          <span style="font-size: 0.8rem; opacity: 0.7">(에러 내용: ${message})</span>
        </p>
        <button onclick="window.location.reload()" style="background: var(--color-indigo); border: none; padding: 0.75rem 1.5rem; color: white; border-radius: 8px; font-weight: bold; cursor: pointer; margin-top: 1rem;">
          <i class="fa-solid fa-rotate-right"></i> 다시 시도
        </button>
      </div>
    `;
  }
}

// Resize listener to reset tabs if shifting to desktop
window.addEventListener('resize', () => {
  if (window.innerWidth > 820) {
    document.body.className = '';
  } else {
    document.body.className = `tab-${currentTab}-active`;
  }
});

// Render Global Macro and Sector Insights Panel
function renderMacroInsight(macro) {
  const container = document.getElementById('macro-insights-container');
  if (!container) return;
  
  if (!macro || !macro.summary || macro.summary.includes("수집되지 않았습니다") || macro.summary.startsWith("최근 24시간 내 중요 거시")) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';

  const macroRefHtml = macro.ref_title && macro.ref_url 
    ? `<a href="${macro.ref_url}" target="_blank" class="macro-ref-link"><i class="fa-solid fa-arrow-up-right-from-square"></i> 참고 뉴스: ${macro.ref_title}</a>`
    : '';

  const sectorPillsHtml = (macro.sector_insights || []).map(si => {
    let iconClass = 'fa-solid fa-microchip'; // Default
    if (si.sector.includes('반도체') || si.sector.includes('AI')) iconClass = 'fa-solid fa-microchip';
    else if (si.sector.includes('빅테크') || si.sector.includes('플랫폼')) iconClass = 'fa-solid fa-laptop-code';
    else if (si.sector.includes('보안') || si.sector.includes('클라우드')) iconClass = 'fa-solid fa-shield-halved';
    else if (si.sector.includes('금융') || si.sector.includes('결제')) iconClass = 'fa-solid fa-credit-card';

    const sectorRefHtml = si.ref_title && si.ref_url
      ? `<a href="${si.ref_url}" target="_blank" class="macro-ref-link sector-ref-link"><i class="fa-solid fa-arrow-up-right-from-square"></i> ${si.ref_title}</a>`
      : '';

    return `
      <div class="macro-sector-pill">
        <div class="macro-sector-name">
          <i class="${iconClass}"></i>
          <span>${si.sector}</span>
        </div>
        <div class="macro-sector-text">${si.insight}</div>
        ${sectorRefHtml}
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="macro-card">
      <div class="macro-header">
        <h2><i class="fa-solid fa-earth-americas text-indigo"></i> 🌍 글로벌 거시경제 & 섹터 인사이트</h2>
      </div>
      <div class="macro-body">
        <div class="macro-summary-wrapper">
          <p class="macro-summary-text">${macro.summary}</p>
          ${macroRefHtml}
        </div>
        <div class="macro-sectors-grid">
          ${sectorPillsHtml}
        </div>
      </div>
    </div>
  `;
}
