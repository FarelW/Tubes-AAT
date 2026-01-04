/**
 * K6 Load Test Script for Citizen Reporting PoC
 *
 * This script performs comprehensive load testing on all backend services
 * with detailed metrics and reporting.
 *
 * Installation:
 *   Windows: choco install k6
 *   Mac: brew install k6
 *   Linux: see https://k6.io/docs/getting-started/installation/
 *
 * Run:
 *   k6 run test-scripts/load-test.k6.js
 *   k6 run --vus 50 --duration 60s test-scripts/load-test.k6.js
 *   k6 run --out json=results.json test-scripts/load-test.k6.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Configuration
const BASE_URLS = {
    REPORTING: 'http://localhost:8080',
    OPERATIONS: 'http://localhost:8081',
    WORKFLOW: 'http://localhost:8082'
};

// Custom metrics
const errorRate = new Rate('errors');
const writeLatency = new Trend('write_latency', true);
const readLatency = new Trend('read_latency', true);
const cqrsSyncTime = new Trend('cqrs_sync_time', true);
const reportsCreated = new Counter('reports_created');
const statusUpdates = new Counter('status_updates');

// Test Options - Stress Test Configuration
export const options = {
    scenarios: {
        // Scenario 1: Ramp-up load test
        ramp_up: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '30s', target: 50 },   // Ramp up to 20 users
                { duration: '1m', target: 100 },    // Ramp up to 100 users
                { duration: '2m', target: 100 },    // Stay at 100 users
                { duration: '30s', target: 150 },  // Spike to 150 users
                { duration: '1m', target: 150 },   // Stay at 150 users
                { duration: '30s', target: 0 },    // Ramp down
            ],
            gracefulRampDown: '10s',
        },
    },
    thresholds: {
        'http_req_duration': ['p(95)<500', 'p(99)<1000'],  // 95% under 500ms, 99% under 1s
        'errors': ['rate<0.1'],                            // Error rate under 10%
        'write_latency': ['p(95)<300'],                    // Write latency 95th percentile
        'read_latency': ['p(95)<500'],                     // Read latency 95th percentile
    },
};

// Helper Functions
function getRandomCategory() {
    const categories = ['infrastruktur', 'kesehatan', 'keamanan', 'kebersihan', 'kriminalitas', 'lainnya'];
    return categories[Math.floor(Math.random() * categories.length)];
}

function getRandomVisibility() {
    const rand = Math.random();
    if (rand > 0.5) return 'PUBLIC';
    if (rand > 0.2) return 'PRIVATE';
    return 'ANONYMOUS';
}

function login(baseUrl, username, password) {
    const res = http.post(`${baseUrl}/auth/login`, JSON.stringify({
        username, password
    }), { headers: { 'Content-Type': 'application/json' } });

    if (res.status === 200) {
        const body = JSON.parse(res.body);
        return body.token;
    }
    return null;
}

// Main Test Function
export default function () {
    // Get tokens (cached per VU)
    const citizenToken = login(BASE_URLS.REPORTING, 'citizen1', 'password');
    const officerToken = login(BASE_URLS.OPERATIONS, 'officer1', 'password');

    if (!citizenToken || !officerToken) {
        errorRate.add(1);
        return;
    }

    const headers = (token) => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    });

    // Test Group 1: Write Operations (CQRS Command)
    group('Write Operations', function () {
        // Create a new report
        const createStart = Date.now();
        const createRes = http.post(
            `${BASE_URLS.REPORTING}/reports`,
            JSON.stringify({
                content: `Load test report ${Date.now()} - VU${__VU} - Iter${__ITER}`,
                visibility: getRandomVisibility(),
                category: getRandomCategory()
            }),
            { headers: headers(citizenToken) }
        );
        writeLatency.add(Date.now() - createStart);

        const createSuccess = check(createRes, {
            'report created': (r) => r.status === 201,
            'report has ID': (r) => JSON.parse(r.body).report_id !== undefined
        });

        errorRate.add(!createSuccess);
        if (createSuccess) {
            reportsCreated.add(1);
            const reportId = JSON.parse(createRes.body).report_id;

            // Wait for CQRS sync
            sleep(1);

            // Verify it appears in read model
            const syncStart = Date.now();
            const readRes = http.get(
                `${BASE_URLS.REPORTING}/reports/me`,
                { headers: headers(citizenToken) }
            );

            const found = JSON.parse(readRes.body).data?.some(r => r.report_id === reportId);
            if (found) {
                cqrsSyncTime.add(Date.now() - syncStart);
            }
        }
    });

    // Test Group 2: Read Operations (CQRS Query)
    group('Read Operations', function () {
        // Get my reports
        const myReportsStart = Date.now();
        const myReportsRes = http.get(
            `${BASE_URLS.REPORTING}/reports/me`,
            { headers: headers(citizenToken) }
        );
        readLatency.add(Date.now() - myReportsStart);

        check(myReportsRes, {
            'my reports fetched': (r) => r.status === 200,
            'my reports is array': (r) => Array.isArray(JSON.parse(r.body).data)
        });

        // Get public reports
        const publicStart = Date.now();
        const publicRes = http.get(`${BASE_URLS.REPORTING}/reports/public`);
        readLatency.add(Date.now() - publicStart);

        check(publicRes, {
            'public reports fetched': (r) => r.status === 200
        });

        // Get officer inbox
        const inboxStart = Date.now();
        const inboxRes = http.get(
            `${BASE_URLS.OPERATIONS}/cases/inbox`,
            { headers: headers(officerToken) }
        );
        readLatency.add(Date.now() - inboxStart);

        check(inboxRes, {
            'inbox fetched': (r) => r.status === 200
        });

        // Get SLA status
        const slaRes = http.get(`${BASE_URLS.WORKFLOW}/sla/status`);
        check(slaRes, {
            'SLA status fetched': (r) => r.status === 200
        });
    });

    // Test Group 3: Status Update Workflow
    group('Status Updates', function () {
        // Get a case from inbox
        const inboxRes = http.get(
            `${BASE_URLS.OPERATIONS}/cases/inbox`,
            { headers: headers(officerToken) }
        );

        const cases = JSON.parse(inboxRes.body).data || [];
        const pendingCase = cases.find(c => c.status === 'RECEIVED');

        if (pendingCase) {
            // Update to IN_PROGRESS
            const updateRes = http.patch(
                `${BASE_URLS.OPERATIONS}/cases/${pendingCase.report_id}/status`,
                JSON.stringify({ status: 'IN_PROGRESS' }),
                { headers: headers(officerToken) }
            );

            const updateSuccess = check(updateRes, {
                'status updated': (r) => r.status === 200
            });

            if (updateSuccess) {
                statusUpdates.add(1);
            }
        }
    });

    // Test Group 4: Upvote Operations
    group('Upvotes', function () {
        const publicRes = http.get(`${BASE_URLS.REPORTING}/reports/public`);
        const reports = JSON.parse(publicRes.body).data || [];

        if (reports.length > 0) {
            const randomReport = reports[Math.floor(Math.random() * reports.length)];
            const upvoteRes = http.post(
                `${BASE_URLS.REPORTING}/reports/${randomReport.report_id}/upvote`,
                null,
                { headers: headers(citizenToken) }
            );

            check(upvoteRes, {
                'upvote successful': (r) => r.status === 200
            });
        }
    });

    // Think time
    sleep(Math.random() * 2 + 1);
}

// Summary Handler
export function handleSummary(data) {
    const now = new Date().toISOString().replace(/[:.]/g, '-');
    const m = data.metrics;

    // Helper
    const getVal = (metric, key) => metric?.values?.[key];
    const fmt = (val) => val !== undefined ? val.toFixed(2) : 'N/A';

    console.log('\n' + '='.repeat(70));
    console.log('  LOAD TEST SUMMARY');
    console.log('='.repeat(70));

    console.log(`\n  Overview:`);
    console.log(`     Total Requests:  ${getVal(m.http_reqs, 'count') || 0}`);
    console.log(`     Duration:        ${(data.state.testRunDurationMs / 1000).toFixed(1)}s`);
    console.log(`     Max VUs:         ${getVal(m.vus_max, 'max') || 0}`);
    console.log(`     Throughput:      ${fmt(getVal(m.http_reqs, 'rate'))} req/s`);

    console.log(`\n  Response Times (http_req_duration):`);
    console.log(`     Median:          ${fmt(getVal(m.http_req_duration, 'p(50)'))}ms`);
    console.log(`     P90:             ${fmt(getVal(m.http_req_duration, 'p(90)'))}ms`);
    console.log(`     P95:             ${fmt(getVal(m.http_req_duration, 'p(95)'))}ms`);
    console.log(`     P99:             ${fmt(getVal(m.http_req_duration, 'p(99)'))}ms`);
    console.log(`     Max:             ${fmt(getVal(m.http_req_duration, 'max'))}ms`);

    console.log(`\n  CQRS Metrics:`);
    console.log(`     Write P95:       ${fmt(getVal(m.write_latency, 'p(95)'))}ms`);
    console.log(`     Read P95:        ${fmt(getVal(m.read_latency, 'p(95)'))}ms`);
    console.log(`     Sync P95:        ${fmt(getVal(m.cqrs_sync_time, 'p(95)'))}ms`);

    console.log(`\n  Counters:`);
    console.log(`     Reports Created: ${getVal(m.reports_created, 'count') || 0}`);
    console.log(`     Status Updates:  ${getVal(m.status_updates, 'count') || 0}`);

    console.log(`\n  Errors:`);
    console.log(`     Rate:            ${fmt((getVal(m.errors, 'rate') || 0) * 100)}%`);
    console.log(`     Failed Requests: ${getVal(m.http_req_failed, 'passes') || 0}`);

    console.log('\n' + '='.repeat(70));

    return {
        [`load-test-results-${now}.json`]: JSON.stringify(data, null, 2),
    };
}
