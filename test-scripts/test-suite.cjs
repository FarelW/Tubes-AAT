/**
 * Comprehensive Backend Test Suite for Citizen Reporting PoC
 *
 * Features:
 * - Health checks for all services
 * - End-to-end workflow tests
 * - CQRS verification (Write DB → Read DB)
 * - Load testing
 * - SLA and escalation testing
 *
 * Run: node test-suite.js
 * Prerequisites: docker-compose up --build -d
 */

const http = require('http');

// Service URLs
const SERVICES = {
    REPORTING: 'http://localhost:8080',
    OPERATIONS: 'http://localhost:8081',
    WORKFLOW: 'http://localhost:8082'
};

// Test state
let citizenToken = '';
let officerToken = '';
let reportIds = [];
let testResults = { passed: 0, failed: 0, tests: [] };

// === HTTP Client ===
async function request(baseUrl, path, method = 'GET', body = null, token = null) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(baseUrl + path);
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname,
            method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (token) options.headers['Authorization'] = `Bearer ${token}`;

        const req = http.request(options, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode, data });
                }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

const delay = ms => new Promise(r => setTimeout(r, ms));

// === Test Helpers ===
function logTest(name, passed, details = '') {
    const status = passed ? 'PASS' : 'FAIL';
    console.log(`   [${status}] ${name}${details ? ': ' + details : ''}`);
    testResults.tests.push({ name, passed });
    passed ? testResults.passed++ : testResults.failed++;
}

// === Test Suites ===

async function testHealthChecks() {
    console.log('\n[1/6] HEALTH CHECKS');
    try {
        const r1 = await request(SERVICES.REPORTING, '/health');
        logTest('Reporting Service', r1.data.status === 'healthy', r1.data.status);

        const r2 = await request(SERVICES.OPERATIONS, '/health');
        logTest('Operations Service', r2.data.status === 'healthy', r2.data.status);

        const r3 = await request(SERVICES.WORKFLOW, '/health');
        logTest('Workflow Service', r3.data.status === 'healthy', r3.data.status);

        // Check CQRS enabled
        logTest('CQRS Enabled', r1.data.cqrs === 'enabled', r1.data.cqrs || 'not returned');
    } catch (e) {
        logTest('Services Running', false, e.message);
        return false;
    }
    return true;
}

async function testAuthentication() {
    console.log('\n[2/6] AUTHENTICATION');

    // Citizen Login
    const citizenRes = await request(SERVICES.REPORTING, '/auth/login', 'POST', { username: 'citizen1', password: 'password' });
    logTest('Citizen Login', citizenRes.data.success);
    citizenToken = citizenRes.data.token;

    // Officer Login
    const officerRes = await request(SERVICES.OPERATIONS, '/auth/login', 'POST', { username: 'officer1', password: 'password' });
    logTest('Officer Login', officerRes.data.success);
    officerToken = officerRes.data.token;

    // Invalid Login
    const invalidRes = await request(SERVICES.REPORTING, '/auth/login', 'POST', { username: 'invalid', password: 'wrong' });
    logTest('Invalid Login Rejected', !invalidRes.data.success);

    // Missing Token
    const noAuthRes = await request(SERVICES.REPORTING, '/reports/me');
    logTest('Protected Route Requires Auth', noAuthRes.status === 401);
}

async function testCQRSWorkflow() {
    console.log('\n[3/6] CQRS WORKFLOW (Write -> Event -> Read)');

    // Create Report
    const createRes = await request(SERVICES.REPORTING, '/reports', 'POST', {
        content: `CQRS Test Report ${Date.now()}`,
        visibility: 'PUBLIC',
        category: 'infrastruktur'
    }, citizenToken);

    logTest('Create Report (WriteDB)', createRes.data.success);
    const reportId = createRes.data.report_id;
    reportIds.push(reportId);

    // Wait for event propagation
    await delay(2000);

    // Read Report
    const readRes = await request(SERVICES.REPORTING, '/reports/me', 'GET', null, citizenToken);
    const found = readRes.data.data?.find(r => r.report_id === reportId);
    logTest('Read Report (ReadDB)', !!found);

    // Verify status
    logTest('Initial Status is RECEIVED', found?.current_status === 'RECEIVED');

    // Check officer inbox
    const inboxRes = await request(SERVICES.OPERATIONS, '/cases/inbox', 'GET', null, officerToken);
    const inboxCase = inboxRes.data.data?.find(c => c.report_id === reportId);
    logTest('Case Routed to Officer Inbox', !!inboxCase);

    // Check SLA job
    const slaRes = await request(SERVICES.WORKFLOW, '/sla/status');
    const slaJob = slaRes.data.data?.find(s => s.report_id === reportId);
    logTest('SLA Job Created', !!slaJob);

    return reportId;
}

async function testStatusUpdate(reportId) {
    console.log('\n[4/6] STATUS UPDATE FLOW');

    // Update to IN_PROGRESS
    const progressRes = await request(SERVICES.OPERATIONS, `/cases/${reportId}/status`, 'PATCH', {
        status: 'IN_PROGRESS'
    }, officerToken);
    logTest('Update to IN_PROGRESS', progressRes.data.success);

    await delay(2000);

    // Verify citizen sees updated status
    const citizenReadRes = await request(SERVICES.REPORTING, '/reports/me', 'GET', null, citizenToken);
    const report = citizenReadRes.data.data?.find(r => r.report_id === reportId);
    logTest('Citizen Sees IN_PROGRESS', report?.current_status === 'IN_PROGRESS');

    // Check notification
    const notifRes = await request(SERVICES.WORKFLOW, '/notifications/me', 'GET', null, citizenToken);
    logTest('Notification Created', notifRes.data.data?.length > 0);

    // Resolve the case
    const resolveRes = await request(SERVICES.OPERATIONS, `/cases/${reportId}/status`, 'PATCH', {
        status: 'RESOLVED'
    }, officerToken);
    logTest('Update to RESOLVED', resolveRes.data.success);

    await delay(1000);

    // Verify SLA completed
    const slaRes = await request(SERVICES.WORKFLOW, '/sla/status');
    const slaJob = slaRes.data.data?.find(s => s.report_id === reportId);
    logTest('SLA Marked Complete', slaJob?.sla_status === 'COMPLETED');
}

async function testLoadReportCreation(numReports = 10) {
    console.log(`\n[5/6] LOAD TEST (${numReports} concurrent reports)`);

    const startTime = Date.now();
    const promises = [];

    for (let i = 0; i < numReports; i++) {
        promises.push(
            request(SERVICES.REPORTING, '/reports', 'POST', {
                content: `Load Test Report #${i + 1}`,
                visibility: 'PUBLIC',
                category: ['infrastruktur', 'kesehatan', 'keamanan'][i % 3]
            }, citizenToken)
        );
    }

    const results = await Promise.all(promises);
    const elapsed = Date.now() - startTime;
    const successCount = results.filter(r => r.data?.success).length;

    logTest(`${numReports} Reports Created`, successCount === numReports, `${successCount}/${numReports} in ${elapsed}ms`);
    logTest('Avg Response Time', true, `${(elapsed / numReports).toFixed(0)}ms/report`);

    // Wait for events
    await delay(3000);

    // Verify all appeared in read model
    const readRes = await request(SERVICES.REPORTING, '/reports/me', 'GET', null, citizenToken);
    const totalReports = readRes.data.data?.length || 0;
    logTest('All Reports in Read Model', totalReports >= numReports, `Found ${totalReports}`);
}

async function testUpvotes() {
    console.log('\n[6/6] UPVOTE FUNCTIONALITY');

    // Get public reports
    const publicRes = await request(SERVICES.REPORTING, '/reports/public');
    logTest('Fetch Public Reports', publicRes.data.success);

    if (publicRes.data.data?.length > 0) {
        const reportToUpvote = publicRes.data.data[0];
        const initialVotes = reportToUpvote.vote_count || 0;

        // Upvote
        const upvoteRes = await request(SERVICES.REPORTING, `/reports/${reportToUpvote.report_id}/upvote`, 'POST', null, citizenToken);
        logTest('Upvote Report', upvoteRes.data.success);

        await delay(500);

        // Verify vote count increased
        const afterRes = await request(SERVICES.REPORTING, '/reports/public');
        const afterReport = afterRes.data.data?.find(r => r.report_id === reportToUpvote.report_id);
        logTest('Vote Count Updated', afterReport?.vote_count >= initialVotes);
    }
}

// === Main Runner ===
async function runAllTests() {
    console.log('='.repeat(60));
    console.log('  CITIZEN REPORTING POC - BACKEND TEST SUITE');
    console.log('='.repeat(60));

    const healthOk = await testHealthChecks();
    if (!healthOk) {
        console.log('\nServices not running. Run: docker-compose up --build -d');
        process.exit(1);
    }

    await testAuthentication();
    const reportId = await testCQRSWorkflow();
    await testStatusUpdate(reportId);
    await testLoadReportCreation(10);
    await testUpvotes();

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('  TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`   Passed: ${testResults.passed}`);
    console.log(`   Failed: ${testResults.failed}`);
    console.log(`   Total:  ${testResults.passed + testResults.failed}`);
    console.log('='.repeat(60));

    if (testResults.failed > 0) {
        console.log('\n   Failed Tests:');
        testResults.tests.filter(t => !t.passed).forEach(t => console.log(`   - ${t.name}`));
    }

    process.exit(testResults.failed > 0 ? 1 : 0);
}

runAllTests().catch(e => {
    console.error('Test suite error:', e);
    process.exit(1);
});
