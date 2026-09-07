#pragma once

#include "position.hpp"

#include <cstdint>
#include <optional>
#include <unordered_map>

namespace connect5 {

struct KeyHash {
  std::size_t operator()(const Key& key) const;
};

struct SearchStats {
  std::uint64_t nodes{};
  std::uint64_t hits{};
};

class Solver {
 public:
  explicit Solver(std::uint64_t node_limit = 0);
  std::optional<Result> solve(const Position& position);
  SearchStats stats() const;

 private:
  std::optional<Result> negamax(const Position& position);

  std::uint64_t node_limit_{};
  SearchStats stats_{};
  std::unordered_map<Key, Result, KeyHash> table_{};
};

}
