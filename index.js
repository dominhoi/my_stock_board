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
  const isMobile = window.innerWidth <= 1023;
  if (isMobile) {
    document.body.className = `tab-${currentTab}-active`;
  }
}

// Switch tabs on mobile/desktop layout
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  
  // Set body class for CSS to handle visibility
  document.body.className = `tab-${tab}-active`;

  // Render Real Estate if selected
  if (tab === 'real-estate') {
    renderRealEstate();
  }
}

// Fetch data from local data.json
async function fetchDashboardData() {
  try {
    // Fetch data.json which is automatically written by the GitHub Action
    const response = await fetch('./data.json?t=' + new Date().getTime());
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

  // 2.6. Render AI Advisor (Arthur, Oliver, Leo) Suggestions
  renderAgentAdvisor(dashboardData.agent_suggestions);

  // 3. Render Owned Stock cards
  renderOwnedStocks(dashboardData.owned_stocks || []);

  // 4. Render Watched Stock cards
  renderWatchedStocks(dashboardData.watched_stocks || []);

  // 5. Render Real Estate if active
  if (currentTab === 'real-estate') {
    renderRealEstate();
  }
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

    // Calculate asset allocation weights for legend
    const legendData = filteredStocks.map(stock => {
      const evalKrw = stock.is_usd 
        ? stock.current_price * stock.qty * krwRate 
        : stock.current_price * stock.qty;
      return {
        name: stock.name,
        value: Math.max(0, evalKrw)
      };
    }).filter(item => item.value > 0);

    legendData.sort((a, b) => b.value - a.value);

    // Sync colors with chart palette
    const backgroundColors = [
      '#6366f1',   // Indigo
      '#8b5cf6',   // Violet
      '#10b981',   // Emerald
      '#f59e0b',   // Amber
      '#ef4444',   // Ruby
      '#06b6d4',   // Cyan
      '#ec4899',   // Pink
      '#64748b'    // Slate
    ];

    const legendHtml = legendData.slice(0, 5).map((item, idx) => {
      const pct = ((item.value / totalEvalKrw) * 100).toFixed(1);
      const color = backgroundColors[idx % backgroundColors.length];
      return `
        <div class="legend-item">
          <span class="legend-chip" style="background-color: ${color}"></span>
          <span class="legend-name" title="${item.name}">${item.name}</span>
          <span class="legend-pct">${pct}%</span>
        </div>
      `;
    }).join('');

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
      <div class="allocation-legend-box">
        <div class="legend-title"><i class="fa-solid fa-chart-pie"></i> 포트폴리오 비중 Top 5</div>
        <div class="legend-list-grid">
          ${legendHtml}
        </div>
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
      <div class="stock-news-empty">
        <span class="news-empty-badge"><i class="fa-regular fa-newspaper"></i> 최근 24시간 내 중요 뉴스 없음</span>
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
  if (window.innerWidth > 1023) {
    document.body.className = '';
  } else {
    document.body.className = `tab-${currentTab}-active`;
  }
});

// Render Global Macro and Sector Insights Panel
function renderMacroInsight(macro) {
  const container = document.getElementById('macro-insights-container');
  if (!container) return;
  
  if (!macro || !macro.summary) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';

  const macroRefHtml = macro.ref_title && macro.ref_url 
    ? `<a href="${macro.ref_url}" target="_blank" class="macro-ref-link"><i class="fa-solid fa-arrow-up-right-from-square"></i> 참고 뉴스: ${macro.ref_title}</a>`
    : '';

  const indicators = dashboardData ? (dashboardData.macro_indicators || []) : [];
  
  // 1. Calculate Money Flow & Risk Mode
  let moneyFlowStatusHtml = '';
  let assetGroupsHtml = '';
  
  if (indicators.length > 0) {
    const indMap = {};
    indicators.forEach(ind => {
      indMap[ind.ticker] = ind;
    });

    // Helpers to get avg change_pct for a group of tickers
    const getAvgChange = (tickers) => {
      let sum = 0;
      let count = 0;
      tickers.forEach(t => {
        if (indMap[t] && !isNaN(indMap[t].change_pct)) {
          sum += indMap[t].change_pct;
          count++;
        }
      });
      return count > 0 ? sum / count : 0;
    };

    // Calculate asset groups average change_pct
    const usStockAvg = getAvgChange(["^IXIC"]);
    const krStockAvg = getAvgChange(["^KS11"]);
    const cryptoAvg = getAvgChange(["BTC-USD", "ETH-USD"]);
    const bondAvg = getAvgChange(["TLT"]); // long term bond price
    const fxAvg = getAvgChange(["DX-Y.NYB", "USDKRW=X"]); // dollar strength
    const cmdAvg = getAvgChange(["GC=F", "CL=F", "HG=F"]); // gold, oil, copper
    const reAvg = getAvgChange(["VNQ"]); // real estate REITs

    // Classify Risk-On (Stock, Crypto, REITs) vs Risk-Off (Bond price, Dollar, Gold)
    const riskOnAvg = (usStockAvg + krStockAvg + cryptoAvg + reAvg) / 4;
    const riskOffAvg = (bondAvg + fxAvg + (indMap["GC=F"] ? indMap["GC=F"].change_pct : 0)) / 3;

    // Define Money Flow State
    let flowState = 'neutral'; // 'riskon', 'riskoff', or 'neutral'
    let stateTitle = '💤 글로벌 자금 기류: 중립 (Neutral) 관망 국면';
    let stateDesc = '자산 시장 전반이 뚜렷한 방향성 없이 관망세를 나타내고 있습니다.';
    let stateClass = 'flow-neutral';

    if (riskOnAvg > 0.4 && riskOffAvg < 0.2) {
      flowState = 'riskon';
      stateTitle = '🟢 글로벌 자금 기류: 위험자산 선호 (Risk-On) 장세';
      stateDesc = '자금이 주식, 암호화폐, 부동산 리츠 등 수익성 자산으로 유입 중입니다.';
      stateClass = 'flow-riskon';
    } else if (riskOffAvg > 0.3 && riskOnAvg < -0.4) {
      flowState = 'riskoff';
      stateTitle = '🚨 글로벌 자금 기류: 안전자산 피난 (Risk-Off) 장세';
      stateDesc = '위험자산 회피 성향이 강해지며 자금이 달러, 채권, 안전자산으로 피난하고 있습니다.';
      stateClass = 'flow-riskoff';
    }

    moneyFlowStatusHtml = `
      <div class="money-flow-status-card ${stateClass}">
        <div class="flow-status-title">${stateTitle}</div>
        <div class="flow-status-desc">${stateDesc}</div>
      </div>
    `;

    // Helper to get signal light class and label
    const getSignalLight = (avg) => {
      if (avg >= 2.0) return { class: 'sig-fire', label: '🔥 강한 쏠림', color: '#ff4b4b' };
      if (avg >= 0.2) return { class: 'sig-inflow', label: '🟢 자금 유입', color: '#10b981' };
      if (avg > -0.2 && avg < 0.2) return { class: 'sig-neutral', label: '⚪ 중립/관망', color: '#64748b' };
      if (avg <= -2.0) return { class: 'sig-outflow-heavy', label: '🔴 강한 이탈', color: '#ef4444' };
      return { class: 'sig-outflow-light', label: '🟡 약한 이탈', color: '#f59e0b' };
    };

    const groups = [
      { name: '미국 주식시장', avg: usStockAvg, desc: '나스닥 종합지수 (^IXIC)', icon: 'fa-solid fa-chart-line' },
      { name: '한국 주식시장', avg: krStockAvg, desc: '코스피 지수 (^KS11)', icon: 'fa-solid fa-chart-simple' },
      { name: '암호화폐', avg: cryptoAvg, desc: '비트코인, 이더리움 평균', icon: 'fa-brands fa-bitcoin' },
      { name: '리츠/부동산', avg: reAvg, desc: '미국 리츠부동산(VNQ)', icon: 'fa-solid fa-building-columns' },
      { name: '채권/국채', avg: bondAvg, desc: '미국 20년물 국채(TLT)', icon: 'fa-solid fa-vault' },
      { name: '달러/외환', avg: fxAvg, desc: '달러인덱스, 환율 평균', icon: 'fa-solid fa-money-bill-transfer' },
      { name: '원자재/실물', avg: cmdAvg, desc: '금, 원유, 구리 평균', icon: 'fa-solid fa-gem' }
    ];

    const groupCardsHtml = groups.map(g => {
      const sig = getSignalLight(g.avg);
      const sign = g.avg >= 0 ? '+' : '';
      return `
        <div class="asset-group-card">
          <div class="group-left">
            <span class="group-signal-dot" style="background-color: ${sig.color}"></span>
            <div class="group-icon-name">
              <i class="${g.icon}"></i>
              <strong>${g.name}</strong>
            </div>
            <span class="group-desc">${g.desc}</span>
          </div>
          <div class="group-right">
            <span class="group-avg-val">${sign}${g.avg.toFixed(2)}%</span>
            <span class="group-badge" style="border-color: ${sig.color}; color: ${sig.color}">${sig.label}</span>
          </div>
        </div>
      `;
    }).join('');

    assetGroupsHtml = `
      <div class="asset-groups-wrapper">
        <div class="indicators-title"><i class="fa-solid fa-traffic-light"></i> 7대 자산군별 자금 강도 신호등</div>
        <div class="asset-groups-grid">
          ${groupCardsHtml}
        </div>
      </div>
    `;
  }

  // Render Mini Indicators Dashboard Grid
  let indicatorsHtml = '';
  const indicatorIcons = {
    "^TNX": "fa-solid fa-percent",
    "DX-Y.NYB": "fa-solid fa-dollar-sign",
    "^VIX": "fa-solid fa-triangle-exclamation",
    "USDKRW=X": "fa-solid fa-money-bill-transfer",
    "GC=F": "fa-solid fa-gem",
    "CL=F": "fa-solid fa-droplet",
    "HG=F": "fa-solid fa-industry",
    "BTC-USD": "fa-brands fa-bitcoin",
    "ETH-USD": "fa-brands fa-ethereum",
    "VNQ": "fa-solid fa-building-columns",
    "TLT": "fa-solid fa-vault",
    "^IXIC": "fa-solid fa-chart-line",
    "^KS11": "fa-solid fa-chart-simple"
  };

  if (indicators.length > 0) {
    const cardsHtml = indicators.map(ind => {
      const isUp = ind.change_pct >= 0;
      const changeClass = isUp ? 'change-up' : 'change-down';
      const arrow = isUp ? '🔺' : '🔻';
      const icon = indicatorIcons[ind.ticker] || 'fa-solid fa-chart-pie';
      
      let valFormatted = ind.value.toLocaleString();
      if (ind.ticker === "^TNX") valFormatted = `${ind.value.toFixed(3)}%`;
      else if (ind.ticker === "USDKRW=X" || ind.ticker === "DX-Y.NYB" || ind.ticker === "VNQ" || ind.ticker === "TLT") valFormatted = ind.value.toFixed(2);
      
      return `
        <div class="indicator-mini-card">
          <div class="ind-icon-name">
            <i class="${icon}"></i>
            <span class="ind-name" title="${ind.name}">${ind.name}</span>
          </div>
          <div class="ind-val-change">
            <span class="ind-value">${valFormatted}</span>
            <span class="ind-change ${changeClass}">${arrow} ${ind.change_pct >= 0 ? '+' : ''}${ind.change_pct.toFixed(2)}%</span>
          </div>
        </div>
      `;
    }).join('');

    indicatorsHtml = `
      <div class="macro-indicators-wrapper">
        <div class="indicators-grid-container">
          ${cardsHtml}
        </div>
      </div>
    `;
  }

  // Determine if it is a fallback state (news not collected)
  const isFallback = macro.summary.includes("수집되지 않았습니다") || macro.summary.startsWith("최근 24시간");

  // Render Calendar to its own bottom layout container
  const calendarContainer = document.getElementById('macro-calendar-container');
  if (calendarContainer) {
    if (isFallback) {
      calendarContainer.style.display = 'block';
      calendarContainer.innerHTML = `
        <div class="macro-card">
          <div class="macro-header">
            <h2><i class="fa-regular fa-calendar-days text-indigo"></i> 2026 주요 매크로 핵심 일정 캘린더</h2>
          </div>
          <div class="macro-body">
            <div class="calendar-table-wrapper">
              <table class="calendar-table">
                <thead>
                  <tr>
                    <th>날짜</th>
                    <th>경제 이벤트 / 발표 지표</th>
                    <th>중요도</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>2026-06-10</td>
                    <td>미국 5월 CPI (소비자물가지수) 발표</td>
                    <td><span class="badge badge-high">🚨 HIGH</span></td>
                  </tr>
                  <tr>
                    <td>2026-06-18</td>
                    <td>FOMC 금리 결정 및 성명서 발표</td>
                    <td><span class="badge badge-high">🚨 HIGH</span></td>
                  </tr>
                  <tr>
                    <td>2026-07-02</td>
                    <td>미국 6월 고용보고서 (비농업 고용 및 실업률)</td>
                    <td><span class="badge badge-medium">⚠️ MID</span></td>
                  </tr>
                  <tr>
                    <td>2026-07-15</td>
                    <td>미국 6월 CPI 발표</td>
                    <td><span class="badge badge-high">🚨 HIGH</span></td>
                  </tr>
                  <tr>
                    <td>2026-07-30</td>
                    <td>FOMC 금리 결정 및 성명서/기자회견</td>
                    <td><span class="badge badge-high">🚨 HIGH</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    } else {
      calendarContainer.style.display = 'none';
      calendarContainer.innerHTML = '';
    }
  }

  // Render 13대 세부 지표 to its own bottom layout container
  const indicatorsContainer = document.getElementById('macro-indicators-container');
  if (indicatorsContainer) {
    if (indicators.length > 0) {
      indicatorsContainer.style.display = 'block';
      indicatorsContainer.innerHTML = `
        <div class="macro-card">
          <div class="macro-header">
            <h2><i class="fa-solid fa-gauge-high text-indigo"></i> 실시간 글로벌 13대 매크로 지표 세부 현황</h2>
          </div>
          <div class="macro-body">
            ${indicatorsHtml}
          </div>
        </div>
      `;
    } else {
      indicatorsContainer.style.display = 'none';
      indicatorsContainer.innerHTML = '';
    }
  }

  const sectorPillsHtml = (macro.sector_insights || []).map(si => {
    let iconClass = 'fa-solid fa-microchip'; // Default
    if (si.sector.includes('반도체') || si.sector.includes('AI')) iconClass = 'fa-solid fa-microchip';
    else if (si.sector.includes('빅테크') || si.sector.includes('플랫폼')) iconClass = 'fa-solid fa-laptop-code';
    else if (si.sector.includes('보안') || si.sector.includes('클라우드')) iconClass = 'fa-solid fa-shield-halved';
    else if (si.sector.includes('금융') || si.sector.includes('결제')) iconClass = 'fa-solid fa-credit-card';

    const sectorRefHtml = si.ref_title && si.ref_url
      ? `<a href="${si.ref_url}" target="_blank" class="macro-ref-link sector-ref-link"><i class="fa-solid fa-arrow-up-right-from-square"></i> ${si.ref_title}</a>`
      : '';

    const isEmpty = si.insight.includes("뉴스 데이터 수집 전") || si.insight.includes("분석 스킵");
    const emptyClass = isEmpty ? 'empty-state' : '';

    return `
      <div class="macro-sector-pill ${emptyClass}">
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
        <h2><i class="fa-solid fa-earth-americas text-indigo"></i> 글로벌 거시경제 & 섹터 인사이트</h2>
      </div>
      <div class="macro-body">
        <!-- 1. 자금 기류 대형 판정 바 -->
        ${moneyFlowStatusHtml}
        
        <!-- 2. 6대 자산군 신호등 -->
        ${assetGroupsHtml}
        
        <!-- 3. CIO 오늘의 총평 줄글 요약 -->
        <div class="macro-summary-wrapper" style="margin-top: 1.5rem;">
          <div class="summary-subtitle" style="font-family: var(--font-header); font-size: 0.95rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 0.5rem;"><i class="fa-solid fa-quote-left"></i> CIO 오늘의 총평</div>
          <p class="macro-summary-text">${macro.summary}</p>
          ${macroRefHtml}
        </div>
        
        <!-- 4. 섹터 인사이트 -->
        <div class="macro-sectors-grid" style="margin-top: 1.5rem;">
          ${sectorPillsHtml}
        </div>
      </div>
    </div>
  `;
}

let currentAgentPersona = 'INTJ'; // Default to INTJ (Arthur)

function renderAgentAdvisor(suggestions) {
  const container = document.getElementById('agent-advisor-container');
  if (!container) return;

  if (!suggestions || Object.keys(suggestions).length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';

  // Helper to construct inner HTML for the opinion body
  const updateAgentBodyHtml = (persona) => {
    const data = suggestions[persona];
    if (!data) return '';
    return `
      <div class="agent-profile">
        <div class="agent-avatar-circle avatar-${persona}">
          <i class="${data.avatar || 'fa-solid fa-user-tie'}"></i>
        </div>
        <div class="agent-name-tag">${data.name}</div>
        <span class="agent-mbti-pill mbti-${persona}">${data.mbti}</span>
      </div>
      <div class="agent-opinion-bubble">
        <div class="agent-opinion-title title-${persona}">✨ ${data.title} (${data.style})</div>
        <div class="agent-opinion-desc">${data.comment}</div>
      </div>
    `;
  };

  // Generate selector tabs dynamically
  const personas = ['INTJ', 'ISTJ', 'ENTP'];
  const tabsHtml = personas.map(p => {
    const data = suggestions[p];
    if (!data) return '';
    const activeClass = p === currentAgentPersona ? 'active' : '';
    const iconMap = {
      'INTJ': 'fa-solid fa-brain',
      'ISTJ': 'fa-solid fa-shield-halved',
      'ENTP': 'fa-solid fa-rocket'
    };
    return `
      <button class="agent-tab-btn ${activeClass}" data-persona="${p}">
        <i class="${iconMap[p]}"></i> ${data.name} (${p})
      </button>
    `;
  }).join('');

  container.innerHTML = `
    <div class="agent-card">
      <div class="agent-card-header">
        <div class="agent-card-title">
          <i class="fa-solid fa-robot"></i> AI 자산관리 어드바이저 브리핑
        </div>
        <div class="agent-selector-tabs">
          ${tabsHtml}
        </div>
      </div>
      <div class="agent-card-body" id="agent-card-body-content">
        ${updateAgentBodyHtml(currentAgentPersona)}
      </div>
    </div>
  `;

  // Attach event listeners for tab switching with transitions
  const tabs = container.querySelectorAll('.agent-tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const selectedPersona = btn.getAttribute('data-persona');
      if (selectedPersona === currentAgentPersona) return;

      currentAgentPersona = selectedPersona;

      // Update active state in tabs
      tabs.forEach(t => t.classList.remove('active'));
      btn.classList.add('active');

      // Trigger smooth fade out/in animation
      const bodyContent = document.getElementById('agent-card-body-content');
      if (bodyContent) {
        bodyContent.classList.add('fade-out');
        setTimeout(() => {
          bodyContent.innerHTML = updateAgentBodyHtml(currentAgentPersona);
          bodyContent.classList.remove('fade-out');
          bodyContent.classList.add('fade-in');
          setTimeout(() => {
            bodyContent.classList.remove('fade-in');
          }, 300);
        }, 150);
      }
    });
  });
}

// ==========================================================================
// K-Real Estate (부동산) Dashboard Rendering
// ==========================================================================
let realEstateChartInstance = null;
let currentReFilter = 'all';

function renderReAgentInsights(suggestions) {
  const container = document.getElementById('re-agent-insight-container');
  if (!container) return;

  if (!suggestions || !suggestions.real_estate_insights || suggestions.real_estate_insights.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';

  // 3-bullet points for real estate insights
  const insights = suggestions.real_estate_insights;

  const bulletsHtml = insights.map(ins => `
    <li><i class="fa-solid fa-circle-check text-indigo"></i> <span>${ins}</span></li>
  `).join('');

  container.innerHTML = `
    <div class="re-agent-card">
      <div class="re-agent-card-header">
        <div class="re-agent-card-title">
          <i class="fa-solid fa-robot"></i> 에이전트 부동산 핵심 분석 (3대 요약)
        </div>
      </div>
      <div class="re-agent-card-content-layout single-column">
        <div class="re-agent-bullet-area">
          <ul class="re-insight-bullets">
            ${bulletsHtml}
          </ul>
        </div>
      </div>
    </div>
  `;
}

function renderRealEstate() {
  if (!dashboardData || !dashboardData.real_estate) return;
  
  const regions = dashboardData.real_estate;
  
  // 0. Render AI Agent Real Estate Insights
  renderReAgentInsights(dashboardData.agent_suggestions);
  
  // 1. Render KPI Cards
  renderReKPIs(regions);
  
  // 2. Render Charts
  renderReCharts(regions);
  
  // 3. Render Transaction Table
  renderReTransactions(regions);
}

// Render KPI cards for Seoul, Bundang, Yongin
function renderReKPIs(regions) {
  const container = document.getElementById('real-estate-metrics-container');
  if (!container) return;
  
  container.innerHTML = regions.map(reg => {
    return `
      <div class="re-metric-card">
        <div class="re-card-header">
          <span class="re-region-name">${reg.name}</span>
          <span class="re-region-code">시군구코드: ${reg.code}</span>
        </div>
        <div class="re-card-body">
          <div class="re-metric-row">
            <span class="re-metric-label">평매매가</span>
            <span class="re-metric-val">${formatRePrice(reg.average_price_krw)}</span>
          </div>
          <div class="re-metric-row">
            <span class="re-metric-label">평균 전세가율</span>
            <span class="re-metric-val highlight-emerald">${reg.jeonse_ratio_pct.toFixed(1)}%</span>
          </div>
          <div class="re-metric-row">
            <span class="re-metric-label">평균 월세</span>
            <span class="re-metric-val">${formatRePrice(reg.monthly_rent_avg_krw)}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Format prices for real estate (e.g. 15억 8,000만원)
function formatRePrice(val) {
  if (val === undefined || val === null || isNaN(val)) return '-';
  if (val >= 100000000) {
    const eok = Math.floor(val / 100000000);
    const rest = Math.round((val % 100000000) / 10000);
    const restStr = rest > 0 ? ` ${rest.toLocaleString()}만원` : '원';
    return `${eok}억${restStr}`;
  }
  return `${Math.round(val / 10000).toLocaleString()}만원`;
}

// Render Transaction Table
function renderReTransactions(regions) {
  const tbody = document.getElementById('real-estate-transactions-tbody');
  if (!tbody) return;
  
  // Combine transactions from all regions (excluding Seoul to focus on Bundang and Yongin Suji)
  let allTxs = [];
  regions.forEach(reg => {
    if (reg.name === '서울시 전체') return; // 서울 실거래 내역은 테이블에서 제외
    
    (reg.recent_transactions || []).forEach(tx => {
      allTxs.push({
        region: reg.name,
        ...tx
      });
    });
  });
  
  // Sort transactions by date descending
  allTxs.sort((a, b) => b.date.localeCompare(a.date));
  
  // Filter by trade_type
  const filteredTxs = allTxs.filter(tx => {
    if (currentReFilter === 'all') return true;
    return tx.trade_type === currentReFilter;
  });
  
  if (filteredTxs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 3rem 0; color: var(--text-muted);">
          <i class="fa-solid fa-circle-exclamation" style="font-size: 1.5rem; margin-bottom: 0.5rem; display: block;"></i>
          해당 거래 종류의 최근 실거래 내역이 없습니다.
        </td>
      </tr>
    `;
    return;
  }
  
  tbody.innerHTML = filteredTxs.map(tx => {
    let tradeBadgeClass = '';
    let priceVal = '';
    
    if (tx.trade_type === '매매') {
      tradeBadgeClass = 'badge-deal';
      priceVal = formatRePrice(tx.price_krw);
    } else if (tx.trade_type === '전세') {
      tradeBadgeClass = 'badge-rent';
      priceVal = formatRePrice(tx.price_krw || tx.deposit_krw);
    } else if (tx.trade_type === '월세') {
      tradeBadgeClass = 'badge-monthly';
      const depositStr = formatRePrice(tx.deposit_krw);
      const rentStr = formatRePrice(tx.price_krw);
      priceVal = `${depositStr} / ${rentStr}`;
    }
    
    return `
      <tr>
        <td><strong>${tx.region}</strong></td>
        <td><span class="apt-name-text" title="${tx.apt_name}">${tx.apt_name}</span></td>
        <td>${tx.size_sqm.toFixed(1)} ㎡</td>
        <td><span class="badge ${tradeBadgeClass}">${tx.trade_type}</span></td>
        <td><span class="tx-price-val">${priceVal}</span></td>
        <td>${tx.floor}층</td>
        <td><span class="tx-date-val">${tx.date}</span></td>
      </tr>
    `;
  }).join('');
}

// Filter transaction table
function filterReTransactions(filter) {
  currentReFilter = filter;
  
  // Update button active state
  document.querySelectorAll('.re-filter-btn').forEach(btn => btn.classList.remove('active'));
  
  const idMap = {
    'all': 're-filter-all',
    '매매': 're-filter-deal',
    '전세': 're-filter-rent',
    '월세': 're-filter-monthly'
  };
  
  const activeBtn = document.getElementById(idMap[filter]);
  if (activeBtn) activeBtn.classList.add('active');
  
  if (dashboardData && dashboardData.real_estate) {
    renderReTransactions(dashboardData.real_estate);
  }
}

// Render Price Index Chart
function renderReCharts(regions) {
  const canvas = document.getElementById('real-estate-trend-chart');
  if (!canvas) return;
  
  const refRegion = regions.find(reg => reg.price_index_trend && reg.price_index_trend.length > 0);
  if (!refRegion) return;
  
  const labels = refRegion.price_index_trend.map(t => t.date);
  
  const colors = [
    { buy: '#6366f1', jeonse: 'rgba(99, 102, 241, 0.45)' }, // Indigo
    { buy: '#8b5cf6', jeonse: 'rgba(139, 92, 246, 0.45)' }, // Violet
    { buy: '#10b981', jeonse: 'rgba(16, 185, 129, 0.45)' }  // Emerald
  ];
  
  const datasets = [];
  regions.forEach((reg, idx) => {
    const color = colors[idx % colors.length];
    
    datasets.push({
      label: `${reg.name} 매매지수`,
      data: reg.price_index_trend.map(t => t.buy_index),
      borderColor: color.buy,
      backgroundColor: color.buy,
      borderWidth: 2,
      tension: 0.2,
      pointRadius: 3
    });
    
    datasets.push({
      label: `${reg.name} 전세지수`,
      data: reg.price_index_trend.map(t => t.jeonse_index),
      borderColor: color.jeonse,
      backgroundColor: color.jeonse,
      borderWidth: 1.5,
      borderDash: [4, 4],
      tension: 0.2,
      pointRadius: 2
    });
  });
  
  const ctx = canvas.getContext('2d');
  if (realEstateChartInstance) {
    realEstateChartInstance.destroy();
  }
  
  realEstateChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: '#94a3b8',
            font: {
              size: 10,
              family: 'Outfit'
            },
            boxWidth: 12,
            boxHeight: 8
          }
        },
        tooltip: {
          padding: 10,
          titleFont: { family: 'Outfit', size: 12 },
          bodyFont: { family: 'Plus Jakarta Sans', size: 11 }
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.02)'
          },
          ticks: {
            color: '#94a3b8',
            font: { size: 10 }
          }
        },
        y: {
          grid: {
            color: 'rgba(255, 255, 255, 0.02)'
          },
          ticks: {
            color: '#94a3b8',
            font: { size: 10 }
          }
        }
      }
    }
  });
}
