#include "solver.hpp"

#include <charconv>
#include <chrono>
#include <iostream>
#include <string>

namespace {
const char* label(connect5::Result result) {
  if (result == connect5::Result::win) return "win";
  if (result == connect5::Result::loss) return "loss";
  return "draw";
}
}

int main(int argc, char** argv) {
  if (argc < 2 || argc > 3) {
    std::cerr << "usage: connect5-solver MOVES [NODE_LIMIT]\n";
    return 2;
  }

  auto position = connect5::Position::from_moves(argv[1]);
  if (!position) {
    std::cerr << "invalid position\n";
    return 2;
  }

  std::uint64_t limit = 0;
  if (argc == 3) {
    std::string value = argv[2];
    auto parsed = std::from_chars(value.data(), value.data() + value.size(), limit);
    if (parsed.ec != std::errc{} || parsed.ptr != value.data() + value.size()) {
      std::cerr << "invalid node limit\n";
      return 2;
    }
  }

  connect5::Solver solver(limit);
  auto started = std::chrono::steady_clock::now();
  auto result = solver.solve(*position);
  auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - started).count();
  auto stats = solver.stats();

  std::cout << "result=" << (result ? label(*result) : "unknown")
            << " nodes=" << stats.nodes
            << " hits=" << stats.hits
            << " ms=" << elapsed << '\n';
  return result ? 0 : 3;
}
