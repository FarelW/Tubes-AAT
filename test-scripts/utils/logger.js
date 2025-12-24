// Simple logger utility
export class Logger {
  static success(message) {
    console.log(`✅ ${message}`);
  }

  static error(message) {
    console.error(`❌ ${message}`);
  }

  static info(message) {
    console.log(`ℹ️  ${message}`);
  }

  static warning(message) {
    console.warn(`⚠️  ${message}`);
  }

  static separator() {
    console.log('\n' + '='.repeat(60) + '\n');
  }

  static section(title) {
    console.log(`\n📋 ${title.toUpperCase()}`);
    console.log('-'.repeat(60));
  }
}

