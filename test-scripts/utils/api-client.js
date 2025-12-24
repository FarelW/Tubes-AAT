import axios from 'axios';
import { config } from '../config.js';
import { Logger } from './logger.js';

// Create axios instances
const commandClient = axios.create({
  baseURL: config.commandService,
  timeout: config.timeout,
  headers: {
    'Content-Type': 'application/json'
  }
});

const queryClient = axios.create({
  baseURL: config.queryService,
  timeout: config.timeout,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Helper function to handle API calls
export async function apiCall(client, method, endpoint, data = null) {
  try {
    const response = await client({
      method,
      url: endpoint,
      data
    });
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    // Determine specific error type
    let errorMessage = 'Unknown error';
    if (error.code === 'ECONNABORTED') {
      errorMessage = 'Timeout';
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Connection refused';
    } else if (error.code === 'ECONNRESET') {
      errorMessage = 'Connection reset';
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = 'Connection timed out';
    } else if (error.response?.status === 503) {
      errorMessage = 'Service unavailable';
    } else if (error.response?.status === 502) {
      errorMessage = 'Bad gateway';
    } else if (error.response?.status === 500) {
      errorMessage = 'Internal server error';
    } else if (error.response?.data?.error) {
      errorMessage = error.response.data.error;
    } else if (error.message) {
      errorMessage = error.message;
    }

    return {
      success: false,
      error: { message: errorMessage, code: error.code },
      status: error.response?.status || 500
    };
  }
}

// Command Service API
export const commandAPI = {
  // Health check
  async healthCheck() {
    return await apiCall(commandClient, 'GET', '/health');
  },

  // Create report
  async createReport(reportData) {
    return await apiCall(commandClient, 'POST', '/reports', reportData);
  },

  // Update report
  async updateReport(id, updateData) {
    return await apiCall(commandClient, 'PUT', `/reports/${id}`, updateData);
  },

  // Delete report
  async deleteReport(id) {
    return await apiCall(commandClient, 'DELETE', `/reports/${id}`);
  }
};

// Query Service API
export const queryAPI = {
  // Health check
  async healthCheck() {
    return await apiCall(queryClient, 'GET', '/health');
  },

  // Get all reports (paginated - server max 100 per page)
  async getAllReports(params = {}) {
    const queryParams = new URLSearchParams(params);
    // Server max is 100, default is 20
    if (!params.per_page) queryParams.set('per_page', '100');
    if (!params.page) queryParams.set('page', '1');
    return await apiCall(queryClient, 'GET', `/reports?${queryParams}`);
  },

  // Get report by ID
  async getReportById(id) {
    return await apiCall(queryClient, 'GET', `/reports/${id}`);
  },

  // Get reports by category
  async getReportsByCategory(category, params = {}) {
    const queryParams = new URLSearchParams({ category, ...params });
    if (!params.per_page) queryParams.set('per_page', '20');
    return await apiCall(queryClient, 'GET', `/reports?${queryParams}`);
  },

  // Get statistics
  async getStatistics(category = null) {
    const endpoint = category ? `/statistics?category=${category}` : '/statistics';
    return await apiCall(queryClient, 'GET', endpoint);
  }
};

// Utility function to wait (for eventual consistency)
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

