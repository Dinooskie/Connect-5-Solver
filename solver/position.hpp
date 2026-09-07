#pragma once

#include <array>
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace connect5 {

constexpr int cols = 9;
constexpr int rows = 7;
constexpr int stride = rows + 1;
constexpr int connect = 5;
using Bits = unsigned __int128;

enum class Result : std::int8_t { loss = -1, draw = 0, win = 1 };

struct Key {
  Bits current{};
  Bits occupied{};
  auto operator<=>(const Key&) const = default;
};

struct Position {
  Bits player[2]{};
  std::array<std::uint8_t, cols> height{};
  std::uint8_t turn{};
  std::uint8_t ply{};

  static std::optional<Position> from_moves(const std::string& moves);
  bool can_play(int column) const;
  bool play(int column);
  bool won(int side) const;
  bool full() const;
  std::vector<int> legal_moves() const;
  Position mirrored() const;
  Key key() const;
};

bool aligned(Bits stones);
std::string encode(Bits value);

}
