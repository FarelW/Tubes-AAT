// Configuration for API endpoints
export const config = {
    commandService: 'http://localhost:8080',
    queryService: 'http://localhost:8090',
    timeout: 30000, // 30 seconds for load testing
};

// Valid categories
export const categories = [
    'kebersihan',
    'kriminalitas',
    'infrastruktur',
    'kesehatan',
    'keamanan',
    'lainnya'
];

// Valid statuses
export const statuses = [
    'pending',
    'in_progress',
    'resolved',
    'rejected'
];

// Sample report data
export const sampleReports = [
    {
        title: 'Jalan Rusak di Jl. Sudirman',
        description: 'Terdapat lubang besar di jalan utama yang membahayakan pengendara motor dan mobil',
        category: 'infrastruktur'
    },
    {
        title: 'Sampah Menumpuk di Pasar Baru',
        description: 'Tumpukan sampah sudah lebih dari 3 hari tidak diangkut, menimbulkan bau tidak sedap',
        category: 'kebersihan'
    },
    {
        title: 'Pencurian Motor di Parkiran Mall',
        description: 'Sering terjadi pencurian motor di area parkiran lantai 2 mall ABC',
        category: 'kriminalitas'
    },
    {
        title: 'Wabah Demam Berdarah',
        description: 'Terdapat beberapa kasus DBD di RT 05 RW 02, perlu fogging segera',
        category: 'kesehatan'
    },
    {
        title: 'Lampu Jalan Mati',
        description: 'Lampu jalan di gang sekolah mati sudah seminggu, membuat area gelap dan rawan kejahatan',
        category: 'keamanan'
    },
    {
        title: 'Fasilitas Umum Rusak',
        description: 'Tempat duduk di taman kota banyak yang rusak dan tidak layak pakai',
        category: 'lainnya'
    }
];

