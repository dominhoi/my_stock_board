// Global Data Store
let dashboardData = null;
let currentTab = 'owned'; // 'owned' or 'watched'

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
  
  if (!container) return;
  countBadge.textContent = stocks.length;

  if (stocks.length === 0) {
    container.innerHTML = `
      <div class="loading-spinner-container">
        <i class="fa-solid fa-circle-exclamation" style="font-size: 2rem; color: var(--text-muted)"></i>
        <p>보유중인 주식이 없습니다.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = stocks.map(stock => {
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
            <span class="detail-label">개별 예상수익률</span>
            <span class="detail-val ${profitColorClass}">${profitArrow}${stock.profit_pct.toFixed(2)}%</span>
          </div>
        </div>

        <!-- News snippet -->
        ${renderNewsHtml(stock)}
      </div>
    `;
  }).join('');
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
