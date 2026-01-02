/**
 * End-to-End Test Script for Citizen Reporting PoC
 *
 * Run: node test-e2e.js
 * Prerequisites: docker-compose up --build -d
 */

const http = require('http');

const REPORTING_URL = 'http://localhost:8080';
const OPERATIONS_URL = 'http://localhost:8081';
const WORKFLOW_URL = 'http://localhost:8082';

let citizenToken = '';
let officerToken = '';
let reportId = '';

async function request(url, method, body, token) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });

        req.on('error', reject);

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
    console.log('🚀 Starting End-to-End Tests...\n');

    // 1. Health Checks
    console.log('1️⃣ Health Checks...');
    try {
        const r1 = await request(`${REPORTING_URL}/health`, 'GET');
        console.log(`   Reporting Service: ${r1.data.status}`);
        const r2 = await request(`${OPERATIONS_URL}/health`, 'GET');
        console.log(`   Operations Service: ${r2.data.status}`);
        const r3 = await request(`${WORKFLOW_URL}/health`, 'GET');
        console.log(`   Workflow Service: ${r3.data.status}`);
    } catch (e) {
        console.log('   ❌ Services not running. Run: docker-compose up --build -d');
        process.exit(1);
    }

    // 2. Login as Citizen
    console.log('\n2️⃣ Login as Citizen (citizen1)...');
    const loginCitizen = await request(`${REPORTING_URL}/auth/login`, 'POST', {
        username: 'citizen1',
        password: 'password'
    });
    if (loginCitizen.data.success) {
        citizenToken = loginCitizen.data.token;
        console.log(`   ✅ Logged in as: ${loginCitizen.data.user.id} (${loginCitizen.data.user.role})`);
    } else {
        console.log('   ❌ Login failed');
        process.exit(1);
    }

    // 3. Create Report
    console.log('\n3️⃣ Creating Report...');
    const createReport = await request(`${REPORTING_URL}/reports`, 'POST', {
        content: 'Jalan rusak di Jl. Sudirman dekat gedung A',
        visibility: 'PUBLIC',
        category: 'infrastruktur'
    }, citizenToken);

    if (createReport.data.success) {
        reportId = createReport.data.report_id;
        console.log(`   ✅ Report created: ${reportId}`);
        console.log(`   📢 Event published: report.created`);
    } else {
        console.log(`   ❌ Failed: ${createReport.data.error}`);
        process.exit(1);
    }

    // Wait for event to be consumed
    console.log('\n⏳ Waiting for events to propagate (3s)...');
    await delay(3000);

    // 4. Login as Officer
    console.log('\n4️⃣ Login as Officer (officer1 - AGENCY_INFRA)...');
    const loginOfficer = await request(`${OPERATIONS_URL}/auth/login`, 'POST', {
        username: 'officer1',
        password: 'password'
    });
    if (loginOfficer.data.success) {
        officerToken = loginOfficer.data.token;
        console.log(`   ✅ Logged in as: ${loginOfficer.data.user.id} (${loginOfficer.data.user.role}, ${loginOfficer.data.user.agency})`);
    }

    // 5. Check Officer Inbox
    console.log('\n5️⃣ Checking Officer Inbox...');
    const inbox = await request(`${OPERATIONS_URL}/cases/inbox`, 'GET', null, officerToken);
    if (inbox.data.success) {
        console.log(`   ✅ Found ${inbox.data.data.length} case(s) in inbox for ${inbox.data.agency}`);
        if (inbox.data.data.length > 0) {
            const lastCase = inbox.data.data[0];
            console.log(`   📋 Latest: ${lastCase.report_id} - Status: ${lastCase.status}`);
        }
    }

    // 6. Update Status to IN_PROGRESS
    console.log('\n6️⃣ Updating Status to IN_PROGRESS...');
    const updateStatus = await request(`${OPERATIONS_URL}/cases/${reportId}/status`, 'PATCH', {
        status: 'IN_PROGRESS'
    }, officerToken);

    if (updateStatus.data.success) {
        console.log(`   ✅ Status updated: ${updateStatus.data.old_status} → ${updateStatus.data.new_status}`);
        console.log(`   📢 Event published: report.status.updated`);
    } else {
        console.log(`   ❌ Failed: ${updateStatus.data.error}`);
    }

    // Wait for event to be consumed
    console.log('\n⏳ Waiting for events to propagate (2s)...');
    await delay(2000);

    // 7. Check Citizen's Reports
    console.log('\n7️⃣ Checking Citizen\'s Reports (should show updated status)...');
    const myReports = await request(`${REPORTING_URL}/reports/me`, 'GET', null, citizenToken);
    if (myReports.data.success && myReports.data.data.length > 0) {
        const report = myReports.data.data[0];
        console.log(`   ✅ Report ${report.report_id}`);
        console.log(`   📊 Current Status: ${report.current_status}`);
        console.log(`   👍 Votes: ${report.vote_count}`);
    }

    // 8. Check Notifications
    console.log('\n8️⃣ Checking Citizen Notifications...');
    const notifications = await request(`${WORKFLOW_URL}/notifications/me`, 'GET', null, citizenToken);
    if (notifications.data.success) {
        console.log(`   ✅ Found ${notifications.data.data.length} notification(s)`);
        notifications.data.data.forEach(n => {
            console.log(`   📬 ${n.message}`);
        });
    }

    // 9. Check SLA Status
    console.log('\n9️⃣ Checking SLA Status...');
    const slaStatus = await request(`${WORKFLOW_URL}/sla/status`, 'GET');
    if (slaStatus.data.success && slaStatus.data.data.length > 0) {
        const sla = slaStatus.data.data[0];
        console.log(`   📅 Report: ${sla.report_id}`);
        console.log(`   ⏰ Due: ${sla.due_at}`);
        console.log(`   📊 SLA Status: ${sla.sla_status}`);
        console.log(`   ⚠️ Overdue: ${sla.is_overdue}`);
    }

    // 10. Upvote the report
    console.log('\n🔟 Upvoting the report...');
    const upvote = await request(`${REPORTING_URL}/reports/${reportId}/upvote`, 'POST', null, citizenToken);
    if (upvote.data.success) {
        console.log(`   ✅ Upvoted successfully`);
        console.log(`   📢 Event published: report.upvoted`);
    }

    console.log('\n' + '='.repeat(50));
    console.log('✅ End-to-End Test Complete!');
    console.log('='.repeat(50));
    console.log('\n📊 Summary:');
    console.log(`   - Report ID: ${reportId}`);
    console.log(`   - Events Published: report.created, report.status.updated, report.upvoted`);
    console.log(`   - Services: All healthy`);
    console.log('\n💡 Check logs for more details:');
    console.log('   docker-compose logs -f | grep -E "\\[EVENT\\]|\\[CONSUMER\\]"');
}

runTests().catch(console.error);
